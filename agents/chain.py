"""
Meritr chain client — a thin, typed wrapper over web3.py for the Creditcoin EVM network.

Keeps every RPC detail (ABI loading, gas, nonce, receipt handling, POA middleware) in one place
so ``underwriter.py`` reads as risk logic rather than plumbing.
"""

from __future__ import annotations

import logging
from typing import Iterator

from web3 import Web3
from web3.exceptions import ContractLogicError

from .config import Config, load_abi
from .risk import Position

log = logging.getLogger("meritr.chain")


class ChainClient:
    """Read/write access to the deployed Meritr contracts."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.w3 = Web3(Web3.HTTPProvider(cfg.rpc_url, request_kwargs={"timeout": 30}))

        # Substrate-backed EVM chains (Creditcoin included) use a compact extraData field that
        # trips web3's default block validation. The POA middleware relaxes it.
        try:
            from web3.middleware import ExtraDataToPOAMiddleware

            self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        except ImportError:  # web3 v6 name
            try:
                from web3.middleware import geth_poa_middleware

                self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
            except ImportError:
                log.debug("No POA middleware available; continuing without it.")

        self.vault = self.w3.eth.contract(
            address=Web3.to_checksum_address(cfg.vault), abi=load_abi("MeritrVault")
        )
        self.attestor = self.w3.eth.contract(
            address=Web3.to_checksum_address(cfg.attestor), abi=load_abi("MeritrAttestor")
        )
        self.passport = self.w3.eth.contract(
            address=Web3.to_checksum_address(cfg.passport), abi=load_abi("MeritrPassport")
        )

        self.account = None
        if cfg.private_key:
            self.account = self.w3.eth.account.from_key(cfg.private_key)

    # ------------------------------------------------------------------
    # Connectivity
    # ------------------------------------------------------------------

    def connected(self) -> bool:
        try:
            return self.w3.is_connected()
        except Exception:
            return False

    def block_number(self) -> int:
        return self.w3.eth.block_number

    def precompile_present(self) -> bool:
        """Whether an Attestcoin verifier is callable at ``0xFD2`` on this network.

        Native precompiles report empty bytecode, so on a real Creditcoin chain this is inferred
        from the chain id rather than from ``eth_getCode``.
        """
        from .config import ATTESTCOIN_PRECOMPILE, CREDITCOIN_CHAIN_IDS

        if self.cfg.chain_id in CREDITCOIN_CHAIN_IDS:
            return True
        return self.w3.eth.get_code(Web3.to_checksum_address(ATTESTCOIN_PRECOMPILE)) != b""

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    #: Public RPCs reject wide `eth_getLogs` ranges. Creditcoin testnet accepts 10k blocks;
    #: this stays under that with room to spare.
    LOG_CHUNK = 9_000

    def _scan_logs(self, event, from_block: int | None = None) -> list:
        """Collect an event's logs in RPC-sized chunks.

        Scanning from genesis is the obvious implementation and it is wrong on any real chain:
        the node rejects the range, the exception is swallowed, and the caller concludes the
        book is empty. That failure is indistinguishable from "no loans exist", which is how it
        survives testing against a local chain where the range is small enough to work.
        """
        head = self.w3.eth.block_number
        start = self.cfg.deployed_at_block or from_block or 0
        if from_block is not None:
            start = max(start, from_block)

        out: list = []
        lo = start
        while lo <= head:
            hi = min(lo + self.LOG_CHUNK - 1, head)
            try:
                try:
                    out.extend(event().get_logs(from_block=lo, to_block=hi))
                except TypeError:  # web3 v6 keyword spelling
                    out.extend(event().get_logs(fromBlock=lo, toBlock=hi))
            except Exception as exc:
                log.warning("Log scan failed for blocks %s-%s: %s", lo, hi, exc)
            lo = hi + 1
        return out

    def discover_borrowers(self, from_block: int | None = None) -> list[str]:
        """Every address that has ever opened a loan, newest first.

        Sourced from ``LoanOpened`` logs so the agent needs no off-chain index or database to
        rebuild its entire working set after a restart.
        """
        logs = self._scan_logs(self.vault.events.LoanOpened, from_block)
        seen: dict[str, None] = {}
        for entry in reversed(logs):
            seen.setdefault(entry["args"]["borrower"], None)
        return list(seen)

    def position(self, borrower: str) -> Position:
        view = self.vault.functions.positionOf(Web3.to_checksum_address(borrower)).call()
        return Position.from_chain(Web3.to_checksum_address(borrower), view)

    def facts(self, borrower: str):
        return self.attestor.functions.factsOf(Web3.to_checksum_address(borrower)).call()

    def score_breakdown(self, borrower: str):
        return self.attestor.functions.scoreOf(Web3.to_checksum_address(borrower)).call()

    def vault_stats(self) -> dict:
        return {
            "totalAssets": self.vault.functions.totalAssets().call(),
            "totalIdle": self.vault.functions.totalIdle().call(),
            "totalPrincipal": self.vault.functions.totalPrincipal().call(),
            "totalInterestOwed": self.vault.functions.totalInterestOwed().call(),
            "reserveBalance": self.vault.functions.reserveBalance().call(),
            "pendingReserveInterest": self.vault.functions.pendingReserveInterest().call(),
            "utilizationBps": self.vault.functions.utilizationBps().call(),
            "assetPriceE8": self.vault.functions.assetPriceE8().call(),
            "collateralPriceE8": self.vault.functions.collateralPriceE8().call(),
        }

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    def simulate_restructure(self, borrower: str) -> tuple[int, int, int] | None:
        """Dry-run a restructuring. Returns ``(hf_before, hf_after, debt_retired)`` or ``None``.

        Always run before broadcasting: it turns a would-be reverted transaction — and its
        wasted gas — into a log line, and it gives the agent the projected health factor to
        record alongside its decision.
        """
        # Read-only: simulated *as* the risk agent without needing its key, so the API can
        # run with no key material at all and the simulate panel still works.
        caller = (
            self.account.address
            if self.account
            else Web3.to_checksum_address(self.cfg.risk_agent)
            if self.cfg.risk_agent
            else None
        )
        if not caller:
            return None
        try:
            return self.vault.functions.restructure(
                Web3.to_checksum_address(borrower)
            ).call({"from": caller})
        except ContractLogicError as exc:
            log.info("Restructure would revert for %s: %s", borrower, exc)
            return None
        except Exception as exc:
            log.warning("Restructure simulation failed for %s: %s", borrower, exc)
            return None

    def send_restructure(self, borrower: str) -> str | None:
        """Broadcast a restructuring and wait for its receipt. Returns the tx hash."""
        if not self.account:
            log.error("No RISK_AGENT_PRIVATE_KEY configured; cannot broadcast.")
            return None

        fn = self.vault.functions.restructure(Web3.to_checksum_address(borrower))
        return self._send(fn)

    def send_flag_stress(self, borrower: str) -> str | None:
        return self._send(self.vault.functions.flagStress(Web3.to_checksum_address(borrower)))

    def has_passport(self, holder: str) -> bool:
        """Whether `holder` has minted a passport. Refresh reverts with NoPassport if not."""
        try:
            return self.passport.functions.passportOf(
                Web3.to_checksum_address(holder)
            ).call() != 0
        except Exception:
            return False

    def send_refresh_passport(self, holder: str) -> str | None:
        """Restamp a holder's passport with their latest attested score.

        Checked first rather than attempted-and-caught: a borrower who never minted one is the
        common case, and letting it fail means a reverted gas estimation and an alarming log
        line on every single cycle for every passport-less borrower.
        """
        if not self.has_passport(holder):
            return None
        return self._send(self.passport.functions.refresh(Web3.to_checksum_address(holder)))

    def _send(self, fn) -> str | None:
        if not self.account:
            return None
        try:
            gas = int(fn.estimate_gas({"from": self.account.address}) * 1.25)
        except Exception as exc:
            log.warning("Gas estimation failed (%s); skipping to avoid a guaranteed revert.", exc)
            return None

        tx = fn.build_transaction(
            {
                "from": self.account.address,
                "nonce": self.w3.eth.get_transaction_count(self.account.address),
                "gas": gas,
                "gasPrice": self.w3.eth.gas_price,
                "chainId": self.cfg.chain_id,
            }
        )
        signed = self.account.sign_transaction(tx)
        raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
        tx_hash = self.w3.eth.send_raw_transaction(raw)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)

        if receipt["status"] != 1:
            log.error("Transaction reverted: %s", tx_hash.hex())
            return None
        return tx_hash.hex()

    # ------------------------------------------------------------------
    # Events
    # ------------------------------------------------------------------

    def restructuring_history(self, from_block: int | None = None) -> Iterator[dict]:
        """Every restructuring the protocol has performed — the agent's public audit trail."""
        logs = self._scan_logs(self.vault.events.LoanRestructured, from_block)

        for entry in logs:
            a = entry["args"]
            yield {
                "borrower": a["borrower"],
                "triggeredBy": a["triggeredBy"],
                "oldRateBps": a["oldRateBps"],
                "newRateBps": a["newRateBps"],
                "newMaturity": a["newMaturity"],
                "debtRetired": a["debtRetiredFromReserve"],
                "healthFactorBefore": a["healthFactorBefore"],
                "healthFactorAfter": a["healthFactorAfter"],
                "blockNumber": entry["blockNumber"],
                "txHash": entry["transactionHash"].hex(),
            }
