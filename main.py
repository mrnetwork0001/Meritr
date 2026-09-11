#!/usr/bin/env python3
"""
Meritr — project doctor.

    python3 main.py

Checks that every piece of the stack is present and wired: contracts compiled, deployment
recorded, Python dependencies installed, chain reachable, and the Attestcoin verifier available
at the precompile address. Prints what is missing and the exact command that fixes it.

Run this first when something is not working; it is faster than reading four logs.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PRECOMPILE = "0x0000000000000000000000000000000000000FD2"

OK = "  ok   "
WARN = " warn  "
FAIL = " fail  "

_failures = 0
_warnings = 0


def line(status: str, label: str, detail: str = "", fix: str = "") -> None:
    global _failures, _warnings
    if status == FAIL:
        _failures += 1
    elif status == WARN:
        _warnings += 1
    print(f"[{status}] {label:<34} {detail}")
    if fix and status != OK:
        print(f"{'':<10}       -> {fix}")


def header(title: str) -> None:
    print()
    print(f"  {title}")
    print("  " + "-" * 72)


def main() -> int:
    print("=" * 78)
    print("  MERITR — Autonomous DeAI Debt Restructuring & Credit Risk Memory OS")
    print("  Creditcoin EVM testnet (chain 102031) + Attestcoin Protocol (precompile 0xFD2)")
    print("=" * 78)

    # ---------------------------------------------------------------- toolchain
    header("Toolchain")

    py = sys.version_info
    line(
        OK if py >= (3, 11) else WARN,
        "Python >= 3.11",
        f"{py.major}.{py.minor}.{py.micro}",
        "Meritr targets Python 3.11+",
    )

    try:
        node = subprocess.run(["node", "-v"], capture_output=True, text=True, timeout=10)
        line(OK, "Node.js", node.stdout.strip())
    except Exception:
        line(FAIL, "Node.js", "not found", "Install Node.js 20+")

    line(
        OK if (ROOT / "node_modules").is_dir() else FAIL,
        "npm dependencies",
        "node_modules present" if (ROOT / "node_modules").is_dir() else "missing",
        "npm install",
    )

    asc = ROOT / "node_modules" / "@gluwa" / "asc-contracts"
    line(
        OK if asc.is_dir() else FAIL,
        "@gluwa/asc-contracts",
        "Attestcoin readability base installed" if asc.is_dir() else "missing",
        "npm install @gluwa/asc-contracts",
    )

    # ---------------------------------------------------------------- contracts
    header("Contracts")

    for name in ("MeritrAttestor", "MeritrVault", "MeritrPassport"):
        src = ROOT / "contracts" / f"{name}.sol"
        line(OK if src.exists() else FAIL, f"{name}.sol", "present" if src.exists() else "missing")

    artifacts = ROOT / "artifacts" / "contracts"
    compiled = artifacts.is_dir() and any(artifacts.rglob("MeritrVault.json"))
    line(
        OK if compiled else FAIL,
        "Compiled artifacts",
        "built" if compiled else "not compiled",
        "npx hardhat compile",
    )

    # -------------------------------------------------------------- deployments
    header("Deployments")

    books = sorted((ROOT / "deployments").glob("*.json")) if (ROOT / "deployments").is_dir() else []
    if not books:
        line(
            WARN,
            "Deployment address book",
            "none found",
            "npx hardhat run scripts/deploy.js --network creditcoinTestnet",
        )
    for b in books:
        try:
            data = json.loads(b.read_text())
            line(
                OK,
                f"{b.stem}",
                f"chain {data['chainId']} · vault {data['contracts']['MeritrVault'][:12]}…",
            )
        except Exception as exc:
            line(FAIL, f"{b.stem}", f"unreadable: {exc}")

    # ------------------------------------------------------------------- python
    header("Python packages")

    for mod, hint in [
        ("web3", "chain client"),
        ("fastapi", "risk API"),
        ("pydantic", "API models"),
        ("pytest", "test suite"),
    ]:
        try:
            __import__(mod)
            line(OK, mod, hint)
        except ImportError:
            line(FAIL, mod, "not installed", "pip install -r requirements.txt")

    # -------------------------------------------------------------- live checks
    header("Live connection")

    from agents import config as _cfg_mod

    network = os.getenv("MERITR_NETWORK", _cfg_mod.DEFAULT_NETWORK)
    try:
        from agents import config as agent_config
        from agents.chain import ChainClient

        cfg = agent_config.load(network)
        client = ChainClient(cfg)

        if client.connected():
            line(OK, f"RPC ({cfg.network})", f"block {client.block_number():,}")
            line(
                OK if client.precompile_present() else WARN,
                "Attestcoin verifier",
                (
                    f"available at {PRECOMPILE}"
                    if client.precompile_present()
                    else f"absent at {PRECOMPILE} on this chain"
                ),
                "Deploy to a Creditcoin network, or use scripts/simulate.js locally",
            )
            stats = client.vault_stats()
            dec = 10**cfg.asset_decimals
            line(
                OK,
                "Vault state",
                f"supplied {stats['totalAssets'] / dec:,.0f} · "
                f"reserve {stats['reserveBalance'] / dec:,.0f}",
            )
            line(
                OK if cfg.has_signer else WARN,
                "Risk agent key",
                "configured" if cfg.has_signer else "not set (read-only)",
                "export RISK_AGENT_PRIVATE_KEY=0x…",
            )
        else:
            line(FAIL, f"RPC ({cfg.network})", f"unreachable at {cfg.rpc_url}")
    except Exception as exc:
        line(WARN, "Chain connection", str(exc).split("\n")[0][:60], "See the message above")

    # ------------------------------------------------------------------ summary
    print()
    print("=" * 78)
    if _failures:
        print(f"  {_failures} failure(s), {_warnings} warning(s). Fix the failures above.")
    elif _warnings:
        print(f"  Ready, with {_warnings} warning(s).")
    else:
        print("  All checks passed.")
    print("=" * 78)
    print(
        "\n  npx hardhat test                          contract suite"
        "\n  pytest                                    agent + parity suite"
        "\n  npx hardhat run scripts/simulate.js       end-to-end walkthrough"
        "\n  npm run backend                           risk API on :8000"
        "\n  npm run dev                               dashboard on :3000\n"
    )
    return 1 if _failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
