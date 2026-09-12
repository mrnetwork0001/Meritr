/**
 * Chain definitions for wallet network switching.
 *
 * Creditcoin is not a network any wallet ships with, so connecting is not enough - the app has
 * to be able to *add* the chain via `wallet_addEthereumChain` when the switch fails with 4902.
 * That is the difference between a connect button that works for the author and one that works
 * for a judge opening the app for the first time.
 */

export type ChainDef = {
  chainId: number;
  hexChainId: string;
  name: string;
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
};

const def = (
  chainId: number,
  name: string,
  rpcUrls: string[],
  symbol: string,
  explorer?: string
): ChainDef => ({
  chainId,
  hexChainId: `0x${chainId.toString(16)}`,
  name,
  rpcUrls,
  blockExplorerUrls: explorer ? [explorer] : undefined,
  nativeCurrency: { name: symbol, symbol, decimals: 18 },
});

export const CHAINS: Record<number, ChainDef> = {
  102030: def(
    102030,
    "Creditcoin Mainnet",
    ["https://mainnet3.creditcoin.network"],
    "CTC",
    "https://creditcoin.blockscout.com"
  ),
  102031: def(
    102031,
    "Creditcoin Testnet",
    ["https://rpc.cc3-testnet.creditcoin.network"],
    "CTC",
    "https://creditcoin-testnet.blockscout.com"
  ),
  102032: def(102032, "Creditcoin Devnet", ["https://rpc.cc3-devnet.creditcoin.network"], "CTC"),
  // Local development. The RPC port is whatever `hardhat node` was started on; the app reads
  // the real value from the backend's /api/config at runtime and overrides this.
  31337: def(31337, "Meritr Local", ["http://127.0.0.1:8545"], "ETH"),
};

export function chainName(chainId: number | null): string {
  if (chainId === null) return "unknown";
  return CHAINS[chainId]?.name ?? `chain ${chainId}`;
}

export function explorerFor(chainId: number | null): string | null {
  if (chainId === null) return null;
  return CHAINS[chainId]?.blockExplorerUrls?.[0] ?? null;
}

export function txUrl(chainId: number | null, hash: string): string | null {
  const base = explorerFor(chainId);
  return base ? `${base}/tx/${hash}` : null;
}
