"""
Meritr agent configuration.

Reads the address book that ``scripts/deploy.js`` writes, so the agent, the FastAPI backend and
the frontend all follow a fresh deployment automatically. Nothing here is hand-maintained.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv is optional at runtime
    pass

ROOT = Path(__file__).resolve().parent.parent
DEPLOYMENTS_DIR = ROOT / "deployments"
ARTIFACTS_DIR = ROOT / "artifacts" / "contracts"

#: The Attestcoin native query verifier precompile. 0xFD2 == 4050.
ATTESTCOIN_PRECOMPILE = "0x0000000000000000000000000000000000000FD2"

#: Chain ids verified live against the public RPC endpoints.
CREDITCOIN_MAINNET = 102030
CREDITCOIN_TESTNET = 102031
CREDITCOIN_DEVNET = 102032
CREDITCOIN_CHAIN_IDS = (CREDITCOIN_MAINNET, CREDITCOIN_TESTNET, CREDITCOIN_DEVNET)

#: Meritr's primary target.
DEFAULT_NETWORK = "creditcoinMainnet"

DEFAULT_RPC = {
    "creditcoinMainnet": "https://mainnet3.creditcoin.network",
    "creditcoinTestnet": "https://rpc.cc3-testnet.creditcoin.network",
    "creditcoinDevnet": "https://rpc.cc3-devnet.creditcoin.network",
    "localhost": "http://127.0.0.1:8545",
    "hardhat": "http://127.0.0.1:8545",
}

EXPLORERS = {
    CREDITCOIN_MAINNET: "https://creditcoin.blockscout.com",
    CREDITCOIN_TESTNET: "https://creditcoin-testnet.blockscout.com",
}


class ConfigError(RuntimeError):
    """Raised when the agent cannot locate a usable deployment."""


@dataclass
class Config:
    network: str
    chain_id: int
    rpc_url: str
    attestor: str
    passport: str
    vault: str
    asset: str
    collateral: str
    asset_decimals: int
    collateral_decimals: int
    private_key: str | None
    poll_interval: int
    source_chains: list

    @property
    def has_signer(self) -> bool:
        return bool(self.private_key)

    @property
    def is_mainnet(self) -> bool:
        return self.chain_id == CREDITCOIN_MAINNET

    @property
    def explorer(self) -> str | None:
        return EXPLORERS.get(self.chain_id)


def _load_book(network: str) -> dict:
    path = DEPLOYMENTS_DIR / f"{network}.json"
    if not path.exists():
        available = sorted(p.stem for p in DEPLOYMENTS_DIR.glob("*.json"))
        raise ConfigError(
            f"No deployment found for network '{network}' ({path}).\n"
            f"Available: {available or 'none'}\n"
            "Deploy first:  npx hardhat run scripts/deploy.js --network creditcoinTestnet"
        )
    return json.loads(path.read_text())


def load(network: str | None = None) -> Config:
    """Load agent config for ``network`` (default: ``$MERITR_NETWORK`` or Creditcoin mainnet)."""
    network = network or os.getenv("MERITR_NETWORK", DEFAULT_NETWORK)
    book = _load_book(network)
    contracts = book["contracts"]

    rpc = (
        os.getenv("MERITR_RPC_URL")
        or os.getenv(f"CREDITCOIN_{network.replace('creditcoin', '').upper()}_RPC")
        or DEFAULT_RPC.get(network)
    )
    if not rpc:
        raise ConfigError(f"No RPC URL for network '{network}'. Set MERITR_RPC_URL.")

    return Config(
        network=network,
        chain_id=int(book["chainId"]),
        rpc_url=rpc,
        attestor=contracts["MeritrAttestor"],
        passport=contracts["MeritrPassport"],
        vault=contracts["MeritrVault"],
        asset=contracts["asset"],
        collateral=contracts["collateral"],
        asset_decimals=int(book["decimals"]["asset"]),
        collateral_decimals=int(book["decimals"]["collateral"]),
        private_key=os.getenv("RISK_AGENT_PRIVATE_KEY") or os.getenv("PRIVATE_KEY"),
        poll_interval=int(os.getenv("MERITR_POLL_INTERVAL", "60")),
        source_chains=book.get("sourceChains", []),
    )


def load_abi(contract_name: str) -> list:
    """Read a compiled ABI from the Hardhat artifacts tree."""
    for path in ARTIFACTS_DIR.rglob(f"{contract_name}.json"):
        if path.parent.name == f"{contract_name}.sol":
            return json.loads(path.read_text())["abi"]
    raise ConfigError(
        f"ABI for {contract_name} not found under {ARTIFACTS_DIR}. Run: npx hardhat compile"
    )
