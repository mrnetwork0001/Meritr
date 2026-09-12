"""Testnet CTC faucet.

Creditcoin's own testnet faucet lives in a Discord channel, which means a reviewer who wants to
sign anything on Meritr must first join a server and talk to a bot. Most will not, and the
console's entire transactional half is unreachable without gas - including the demo-token
faucet, so the one button that looks like the way in is itself unreachable.

The claim is **gasless by necessity**, not by preference: a wallet holding zero CTC cannot pay
for a transaction, so it cannot ask for one either. Instead the visitor signs a *message*, which
costs nothing and never touches the chain, and this process pays the gas to send them 1 CTC.

Deliberately narrow:
  * only wallets below 0.1 CTC qualify, though the grant itself is 1 CTC - this refills the empty, it does not top up
  * one claim per address per 24 hours, recorded on disk so a restart does not reset it
  * the signed message names this faucet, the recipient and a timestamp, and is accepted for
    five minutes, so a signature captured elsewhere cannot be replayed here
  * the faucet key holds no roles on any Meritr contract and is not the deployer key
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

CLAIM_WEI = Web3.to_wei(1, "ether")
#: A wallet holding this much can already transact, so it does not need a faucet. Deliberately
#: far below CLAIM_WEI: the grant is generous enough to be useful, but only the nearly-empty
#: qualify. Matching the two would let a wallet that spent 0.01 CTC immediately top back up.
ELIGIBILITY_CEILING_WEI = Web3.to_wei(0.1, "ether")
COOLDOWN_SECONDS = 24 * 60 * 60
SIGNATURE_TTL_SECONDS = 300
#: Leave enough behind to notice the faucet is nearly dry before it starts failing mid-demo.
RESERVE_WEI = Web3.to_wei(5, "ether")

#: Limits a sybil cannot simply opt out of by making a new keypair. The per-address cooldown
#: below is honest-user hygiene; these two are what actually bound the loss, because addresses
#: are free and the signature check proves only that the claimant made the key they are
#: claiming to. The daily cap is the load-bearing one: even against a proxy pool it bounds a
#: day's worst case, so the faucet cannot be emptied in a single pass and the console stays
#: usable for the next reviewer.
PER_IP_COOLDOWN_SECONDS = 6 * 60 * 60
GLOBAL_DAILY_CAP_WEI = Web3.to_wei(25, "ether")

STATE = Path(os.getenv("MERITR_FAUCET_STATE", "var/faucet.json"))
_LOCK = threading.Lock()


class FaucetError(RuntimeError):
    """A refusal the caller should be told about verbatim."""


def message_for(address: str, issued_at: int) -> str:
    """The exact text a claimant signs. Must match the frontend byte for byte."""
    return (
        "Meritr testnet faucet\n"
        f"Address: {Web3.to_checksum_address(address)}\n"
        f"Issued: {issued_at}\n\n"
        "Signing this proves you control this address. It is not a transaction, "
        "costs no gas, and moves nothing."
    )


def message_for_raw(address: str, issued_at: int) -> str:
    """`message_for` without re-checksumming, for a client that signed the address as it had it."""
    return (
        "Meritr testnet faucet\n"
        f"Address: {address}\n"
        f"Issued: {issued_at}\n\n"
        "Signing this proves you control this address. It is not a transaction, "
        "costs no gas, and moves nothing."
    )


def _load() -> dict:
    """Read the claim book, migrating the original flat {address: timestamp} form.

    A read error used to return {} and silently reset every cooldown - failing open on the one
    file whose whole job is to say no. A corrupt or unreadable book now raises, and claim()
    turns that into a refusal rather than a free round for everyone.
    """
    try:
        raw = json.loads(STATE.read_text())
    except FileNotFoundError:
        raw = {}
    except (OSError, ValueError) as exc:
        raise FaucetError("The faucet's claim record is unreadable, so it is refusing to pay.") from exc

    if raw and "addresses" not in raw:  # migrate the flat form written by earlier versions
        raw = {"addresses": raw, "ips": {}, "spend": {"day": 0, "wei": 0}}
    raw.setdefault("addresses", {})
    raw.setdefault("ips", {})
    raw.setdefault("spend", {"day": 0, "wei": 0})
    return raw


def _save(data: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(STATE)


def status(w3: Web3, faucet_address: str | None, address: str | None = None) -> dict:
    """What the console needs to decide whether to offer the button."""
    out: dict = {
        "available": bool(faucet_address),
        "claimWei": str(CLAIM_WEI),
        "claimCtc": 1.0,
        "cooldownSeconds": COOLDOWN_SECONDS,
        "eligibilityCeilingCtc": 0.1,
    }
    if not faucet_address:
        out["reason"] = "No faucet key is configured on this deployment."
        return out

    balance = w3.eth.get_balance(Web3.to_checksum_address(faucet_address))
    out["faucetAddress"] = Web3.to_checksum_address(faucet_address)
    out["faucetBalanceCtc"] = float(Web3.from_wei(balance, "ether"))
    out["dry"] = balance < CLAIM_WEI + RESERVE_WEI

    if address:
        addr = Web3.to_checksum_address(address)
        bal = w3.eth.get_balance(addr)
        last = _load()["addresses"].get(addr.lower(), 0)
        waited = time.time() - last
        out["yourBalanceCtc"] = float(Web3.from_wei(bal, "ether"))
        out["eligible"] = (
            bal < ELIGIBILITY_CEILING_WEI and waited >= COOLDOWN_SECONDS and not out["dry"]
        )
        if bal >= ELIGIBILITY_CEILING_WEI:
            out["reason"] = "This wallet already holds more than 0.1 CTC, so it can pay for its own gas."
        elif waited < COOLDOWN_SECONDS:
            out["retryInSeconds"] = int(COOLDOWN_SECONDS - waited)
            out["reason"] = "This address has claimed within the last 24 hours."
        elif out["dry"]:
            out["reason"] = "The faucet is empty."
    return out


def claim(
    w3: Web3,
    faucet_key: str | None,
    address: str,
    issued_at: int,
    signature: str,
    client_ip: str | None = None,
) -> dict:
    """Verify a signed request and send the claim. Raises FaucetError on any refusal."""
    if not faucet_key:
        raise FaucetError("No faucet key is configured on this deployment.")

    addr = Web3.to_checksum_address(address)
    now = int(time.time())
    if abs(now - issued_at) > SIGNATURE_TTL_SECONDS:
        raise FaucetError("That request has expired. Sign a fresh one.")

    # Wallets disagree about address casing - MetaMask hands back lowercase from eth_accounts -
    # and the signed payload embeds whichever form the client used. Verifying only against the
    # checksummed form rejected every genuine claim from a wallet that had not normalised, so
    # both renderings are accepted. This weakens nothing: the signature must still recover to
    # this address either way.
    candidates = {message_for(addr, issued_at)}
    if address != addr:
        candidates.add(message_for_raw(address, issued_at))

    recovered = None
    for text in candidates:
        try:
            got = Account.recover_message(encode_defunct(text=text), signature=signature)
        except Exception:  # noqa: BLE001 - a malformed signature is just a refusal
            continue
        if Web3.to_checksum_address(got) == addr:
            recovered = got
            break
    if recovered is None:
        raise FaucetError("That signature was not produced by this address.")

    if w3.eth.get_balance(addr) >= ELIGIBILITY_CEILING_WEI:
        raise FaucetError(
            "This wallet already holds more than 0.1 CTC, so it can pay for its own gas."
        )

    account = Account.from_key(faucet_key)
    with _LOCK:
        book = _load()
        last = book["addresses"].get(addr.lower(), 0)
        if now - last < COOLDOWN_SECONDS:
            raise FaucetError(
                f"Already claimed. Try again in {int((COOLDOWN_SECONDS - (now - last)) / 3600) + 1} hours."
            )

        if client_ip:
            ip_last = book["ips"].get(client_ip, 0)
            if now - ip_last < PER_IP_COOLDOWN_SECONDS:
                raise FaucetError("This network has claimed recently. Try again later.")

        day = now // 86400
        spend = book["spend"]
        if spend.get("day") != day:
            spend = {"day": day, "wei": 0}
        if spend["wei"] + CLAIM_WEI > GLOBAL_DAILY_CAP_WEI:
            raise FaucetError("The faucet has hit its daily limit. Try again tomorrow.")

        balance = w3.eth.get_balance(account.address)
        if balance < CLAIM_WEI + RESERVE_WEI:
            raise FaucetError("The faucet is empty. Please tell the team.")

        tx = {
            "to": addr,
            "value": CLAIM_WEI,
            # "pending", not the default "latest": two claims arriving within a block would
            # otherwise read the same nonce and the second is rejected as a replacement
            # transaction underpriced. Judges clicking at the same moment is the expected case,
            # not an edge one.
            "nonce": w3.eth.get_transaction_count(account.address, "pending"),
            "gas": 21000,
            "gasPrice": w3.eth.gas_price,
            "chainId": w3.eth.chain_id,
        }
        # The slot is taken BEFORE the transfer, not after. Recording afterwards means any
        # failure between sending and writing - a crashed process, a read-only mount - leaves
        # an address funded and uncooled, free to claim again without limit. That is the
        # failure that actually drains a faucet, and it is not hypothetical: it happened here,
        # because systemd's ProtectSystem=strict made var/ read-only and the write threw after
        # the CTC had already gone out.
        #
        # Reserving first inverts the risk: the worst case becomes one address losing a single
        # day's claim, which costs nobody anything.
        book["addresses"][addr.lower()] = now
        if client_ip:
            book["ips"][client_ip] = now
        spend["wei"] += CLAIM_WEI
        book["spend"] = spend
        _save(book)

        try:
            signed = account.sign_transaction(tx)
            raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
            tx_hash = w3.eth.send_raw_transaction(raw)
        except Exception:
            # Nothing was sent, so release every slot this attempt reserved.
            book["addresses"].pop(addr.lower(), None)
            if client_ip:
                book["ips"].pop(client_ip, None)
            book["spend"]["wei"] = max(0, book["spend"]["wei"] - CLAIM_WEI)
            _save(book)
            raise

    return {"txHash": Web3.to_hex(tx_hash), "amountCtc": 1.0, "to": addr}
