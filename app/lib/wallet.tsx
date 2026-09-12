"use client";

import { BrowserProvider, JsonRpcSigner } from "ethers";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CHAINS, type ChainDef } from "./chains";

/**
 * Injected-wallet connection for Meritr.
 *
 * Deliberately thin: EIP-1193 against `window.ethereum` plus an ethers v6 signer. No WalletConnect
 * project id to register, no connector registry, no extra provider tree - the app needs one
 * signer against one uncommon chain, and every additional layer is somewhere the Creditcoin
 * network handling could go wrong.
 *
 * The part that actually matters is `ensureChain`: a wallet has never heard of Creditcoin, so a
 * plain `wallet_switchEthereumChain` fails with 4902 and the app must add the network itself.
 */

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

type WalletState = {
  /** null while detection is still pending - see the note in WalletProvider. */
  available: boolean | null;
  account: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureChain: (chainId: number, rpcOverride?: string) => Promise<boolean>;
  getSigner: () => Promise<JsonRpcSigner>;
  /** Bumped after every confirmed transaction so views can refetch. */
  nonce: number;
  bump: () => void;
};

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Tri-state on purpose. `window.ethereum` cannot be read during SSR or before hydration, and
  // rendering "No wallet found" to someone who *has* a wallet - even for one frame - is worse
  // than rendering nothing. Stays null until detection actually runs.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const bump = useCallback(() => setNonce((n) => n + 1), []);

  // Detect an injected provider and re-attach to an already-authorised account, so a reload
  // does not force the reader to reconnect.
  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth) {
      setAvailable(false);
      return;
    }
    setAvailable(true);

    let dead = false;
    (async () => {
      try {
        const accts: string[] = await eth.request({ method: "eth_accounts" });
        const cid: string = await eth.request({ method: "eth_chainId" });
        if (dead) return;
        if (accts?.length) setAccount(accts[0]);
        setChainId(parseInt(cid, 16));
      } catch {
        /* wallet locked or refusing; the connect button still works */
      }
    })();

    const onAccounts = (accts: string[]) => setAccount(accts?.[0] ?? null);
    const onChain = (cid: string) => setChainId(parseInt(cid, 16));

    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      dead = true;
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) {
      setError("No injected wallet found. Install MetaMask, Rabby or a compatible extension.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accts: string[] = await eth.request({ method: "eth_requestAccounts" });
      const cid: string = await eth.request({ method: "eth_chainId" });
      setAccount(accts?.[0] ?? null);
      setChainId(parseInt(cid, 16));
    } catch (e: any) {
      // 4001 is the user declining, which is not an error worth shouting about.
      setError(e?.code === 4001 ? null : (e?.message ?? "Could not connect."));
    } finally {
      setConnecting(false);
    }
  }, []);

  /** Forgets the account locally. EIP-1193 has no true disconnect for injected wallets. */
  const disconnect = useCallback(() => {
    setAccount(null);
    setError(null);
  }, []);

  const ensureChain = useCallback(async (target: number, rpcOverride?: string) => {
    const eth = window.ethereum;
    if (!eth) return false;

    const known: ChainDef | undefined = CHAINS[target];
    const hex = known?.hexChainId ?? `0x${target.toString(16)}`;

    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      setChainId(target);
      return true;
    } catch (e: any) {
      // 4902: the wallet does not know this network yet. Add it, then it is switched to.
      const unknownNetwork = e?.code === 4902 || e?.data?.originalError?.code === 4902;
      if (!unknownNetwork || !known) {
        setError(e?.code === 4001 ? null : (e?.message ?? "Could not switch network."));
        return false;
      }
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hex,
              chainName: known.name,
              rpcUrls: rpcOverride ? [rpcOverride] : known.rpcUrls,
              nativeCurrency: known.nativeCurrency,
              ...(known.blockExplorerUrls ? { blockExplorerUrls: known.blockExplorerUrls } : {}),
            },
          ],
        });
        setChainId(target);
        return true;
      } catch (addErr: any) {
        setError(addErr?.code === 4001 ? null : (addErr?.message ?? "Could not add the network."));
        return false;
      }
    }
  }, []);

  const getSigner = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) throw new Error("No injected wallet.");
    const provider = new BrowserProvider(eth as any);
    return provider.getSigner();
  }, []);

  const value = useMemo(
    () => ({
      available,
      account,
      chainId,
      connecting,
      error,
      connect,
      disconnect,
      ensureChain,
      getSigner,
      nonce,
      bump,
    }),
    [available, account, chainId, connecting, error, connect, disconnect, ensureChain, getSigner, nonce, bump]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>");
  return v;
}
