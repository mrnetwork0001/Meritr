"""
Meritr DeAI Risk & Underwriting Agent.

    python3 -m agents.underwriter --once            # single sweep
    python3 -m agents.underwriter                   # continuous
    python3 -m agents.underwriter --dry-run         # assess only, broadcast nothing
    python3 -m agents.underwriter --network localhost

The loop each cycle:

    1. Discover every borrower from the vault's own ``LoanOpened`` logs — no external index, so
       a restarted agent rebuilds its complete working set from the chain alone.
    2. Read each position and score it against the cross-chain facts that MeritrAttestor has
       proven through the Attestcoin precompile.
    3. Classify, project time-to-liquidation, and estimate the loss an intervention averts.
    4. Triage: rank actionable positions by expected loss averted, because the restructuring
       reserve is finite and order matters when it binds.
    5. Simulate, then broadcast ``restructure(borrower)``.

The agent supplies no economic parameters. ``restructure`` takes an address and nothing else;
the vault recomputes every rate, term and relief amount on-chain from the attested score. The
agent decides *whom and when*, never *how much* — so the worst a stolen agent key can do is
trigger restructurings the protocol would already have approved.
"""

from __future__ import annotations

import argparse
import json
import logging
import signal
import sys
import time

from . import config, scoring
from .chain import ChainClient
from .risk import Assessment, RiskState, assess, triage

log = logging.getLogger("meritr.underwriter")

BANNER = r"""
================================================================================
  MERITR  ::  Autonomous DeAI Debt Restructuring & Credit Risk Memory OS
  Creditcoin EVM  +  Attestcoin Protocol (native query verifier 0xFD2)
================================================================================
"""

_shutdown = False


def _handle_signal(signum, frame):  # noqa: ARG001
    global _shutdown
    _shutdown = True
    log.info("Shutdown requested; finishing the current cycle.")


class Underwriter:
    """The autonomous risk agent."""

    def __init__(self, client: ChainClient, dry_run: bool = False):
        self.client = client
        self.dry_run = dry_run
        self.cycle = 0
        self.restructures_executed = 0
        self.usd_relief_granted = 0.0

    # ------------------------------------------------------------------

    def preflight(self) -> bool:
        cfg = self.client.cfg
        log.info("Network        : %s (chainId %s)", cfg.network, cfg.chain_id)
        log.info("RPC            : %s", cfg.rpc_url)

        if not self.client.connected():
            log.error("Cannot reach RPC endpoint %s", cfg.rpc_url)
            return False

        log.info("Block height   : %s", self.client.block_number())
        log.info("MeritrVault    : %s", cfg.vault)
        log.info("MeritrAttestor : %s", cfg.attestor)
        log.info("MeritrPassport : %s", cfg.passport)

        if self.client.precompile_present():
            log.info("Attestcoin     : verifier available at %s", config.ATTESTCOIN_PRECOMPILE)
        else:
            log.warning(
                "Attestcoin     : no verifier at %s on this network — existing attested facts "
                "still score normally, but new proofs cannot be ingested.",
                config.ATTESTCOIN_PRECOMPILE,
            )

        if self.client.account:
            log.info("Agent identity : %s", self.client.account.address)
        elif self.dry_run:
            log.info("Agent identity : none (dry run)")
        else:
            log.error(
                "No RISK_AGENT_PRIVATE_KEY set. Export one, or pass --dry-run to assess only."
            )
            return False
        return True

    # ------------------------------------------------------------------

    def sweep(self) -> list[Assessment]:
        """Assess every borrower the vault knows about."""
        borrowers = self.client.discover_borrowers()
        if not borrowers:
            log.info("No loans opened yet — nothing to underwrite.")
            return []

        assessments: list[Assessment] = []
        for borrower in borrowers:
            try:
                assessments.append(assess(self.client.position(borrower)))
            except Exception as exc:
                log.warning("Could not assess %s: %s", borrower, exc)
        return assessments

    def report(self, assessments: list[Assessment]) -> None:
        """Print the portfolio picture the agent is acting on."""
        stats = self.client.vault_stats()
        dec = 10 ** self.client.cfg.asset_decimals

        buckets: dict[RiskState, int] = {}
        for a in assessments:
            buckets[a.state] = buckets.get(a.state, 0) + 1

        log.info("-" * 78)
        log.info(
            "Pool  supplied=%.2f  lent=%.2f  idle=%.2f  reserve=%.2f  utilisation=%.1f%%",
            stats["totalAssets"] / dec,
            stats["totalPrincipal"] / dec,
            stats["totalIdle"] / dec,
            stats["reserveBalance"] / dec,
            stats["utilizationBps"] / 100,
        )
        log.info(
            "Book  %s position(s): %s",
            len(assessments),
            ", ".join(f"{k.value}={v}" for k, v in sorted(buckets.items())) or "none",
        )

        for a in assessments:
            if a.state in (RiskState.HEALTHY, RiskState.NO_LOAN):
                continue
            p = a.position
            log.info(
                "  %s  HF=%.3f  score=%d(%s)  debt=$%s  %s",
                p.borrower,
                p.hf,
                p.score,
                scoring.tier_of(p.score),
                f"{a.debt_at_risk_usd:,.0f}",
                a.state.value.upper(),
            )
            log.info("      %s", a.rationale)

    def act(self, assessments: list[Assessment]) -> None:
        """Execute restructurings, most valuable first."""
        queue = triage(assessments)
        if not queue:
            return

        log.info("-" * 78)
        log.info("Triage: %d position(s) actionable, ranked by loss averted.", len(queue))

        for a in queue:
            borrower = a.position.borrower
            averted = a.expected_loss_averted_usd

            if self.dry_run:
                log.info(
                    "  [dry-run] would restructure %s (averts ~$%s)",
                    borrower,
                    f"{averted:,.0f}",
                )
                continue

            simulated = self.client.simulate_restructure(borrower)
            if simulated is None:
                log.info("  Skipping %s — the vault would reject this call.", borrower)
                continue

            hf_before, hf_after, debt_retired = simulated
            log.info(
                "  Restructuring %s: HF %.3f -> %.3f, retiring %.2f from reserve",
                borrower,
                hf_before / scoring.WAD,
                hf_after / scoring.WAD,
                debt_retired / (10 ** self.client.cfg.asset_decimals),
            )

            tx = self.client.send_restructure(borrower)
            if tx:
                self.restructures_executed += 1
                self.usd_relief_granted += debt_retired / (
                    10 ** self.client.cfg.asset_decimals
                )
                log.info("  Confirmed: %s", tx)
                # Keep the borrower's passport in step with their post-rescue standing.
                # No-ops cleanly when they never minted one.
                try:
                    if self.client.send_refresh_passport(borrower):
                        log.info("  Passport refreshed for %s", borrower)
                except Exception as exc:
                    log.debug("Passport refresh skipped for %s: %s", borrower, exc)

    def run_cycle(self) -> list[Assessment]:
        self.cycle += 1
        log.info("=" * 78)
        log.info("Cycle %d  ::  block %s", self.cycle, self.client.block_number())
        assessments = self.sweep()
        if assessments:
            self.report(assessments)
            self.act(assessments)
        return assessments

    def run_forever(self, interval: int) -> None:
        signal.signal(signal.SIGINT, _handle_signal)
        signal.signal(signal.SIGTERM, _handle_signal)

        while not _shutdown:
            try:
                self.run_cycle()
            except Exception as exc:
                log.exception("Cycle failed, continuing: %s", exc)

            log.info(
                "Sleeping %ds. Lifetime: %d restructuring(s), $%s relief granted.",
                interval,
                self.restructures_executed,
                f"{self.usd_relief_granted:,.0f}",
            )
            for _ in range(interval):
                if _shutdown:
                    break
                time.sleep(1)

        log.info("Stopped after %d cycle(s).", self.cycle)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="agents.underwriter",
        description="Meritr autonomous DeAI risk and debt-restructuring agent.",
    )
    parser.add_argument("--network", default=None, help="deployment to target (default: env)")
    parser.add_argument("--once", action="store_true", help="run a single cycle and exit")
    parser.add_argument("--dry-run", action="store_true", help="assess only; broadcast nothing")
    parser.add_argument("--interval", type=int, default=None, help="seconds between cycles")
    parser.add_argument("--json", action="store_true", help="emit assessments as JSON")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )

    if not args.json:
        print(BANNER)

    try:
        cfg = config.load(args.network)
    except config.ConfigError as exc:
        log.error("%s", exc)
        return 1

    client = ChainClient(cfg)
    agent = Underwriter(client, dry_run=args.dry_run)

    if not agent.preflight():
        return 1

    if args.once or args.json:
        assessments = agent.run_cycle()
        if args.json:
            print(json.dumps([a.to_dict() for a in assessments], indent=2))
        return 0

    agent.run_forever(args.interval or cfg.poll_interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
