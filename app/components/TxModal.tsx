"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, X } from "lucide-react";
import { useWallet } from "../lib/wallet";
import { txUrl } from "../lib/chains";

/**
 * Transaction modal.
 *
 * Every on-chain action in Meritr runs through here, and the reason is approvals: an ERC-20
 * action is frequently *two* transactions, and the first one used to happen invisibly inside a
 * helper. A user signed twice, saw one confirmation, and had no hash for the other. Modelling a
 * run as an explicit list of steps makes that second transaction something the interface owes
 * the user rather than something it hides.
 *
 * Each step reports its own hash and explorer link, and the three states a user can act on —
 * waiting on your signature, waiting on the chain, settled — are kept distinct. Collapsing them
 * into one spinner is how a wallet prompt behind the browser window becomes "it's frozen".
 */

export type TxStep = {
  label: string;
  /** Return the transaction hash. Return null for a step that turned out to be unnecessary. */
  run: () => Promise<string | null>;
  /** Shown under the label while the step is pending. */
  detail?: string;
};

export type TxRequest = {
  title: string;
  /** Plain-language statement of what this does on-chain, and to whom. */
  description: string;
  steps: TxStep[];
  /** Rendered as a label/value table above the steps. */
  facts?: Array<[string, string]>;
  onSettled?: (ok: boolean) => void;
};

type StepState = {
  label: string;
  detail?: string;
  status: "waiting" | "signing" | "pending" | "done" | "skipped" | "failed";
  hash?: string | null;
  error?: string;
};

type Ctx = { run: (req: TxRequest) => void; busy: boolean };
const TxCtx = createContext<Ctx | null>(null);

export function useTx(): Ctx {
  const v = useContext(TxCtx);
  if (!v) throw new Error("useTx must be used inside <TxProvider>");
  return v;
}

/** Pull the most useful sentence out of an ethers/provider error. */
function readableError(e: any): string | null {
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED") return null; // user declined
  return String(
    e?.revert?.name ??
      e?.reason ??
      e?.shortMessage ??
      e?.info?.error?.message ??
      e?.message ??
      "Transaction failed"
  ).slice(0, 240);
}

export function TxProvider({ children }: { children: React.ReactNode }) {
  const { chainId, bump } = useWallet();
  const [req, setReq] = useState<TxRequest | null>(null);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<null | "ok" | "failed" | "cancelled">(null);

  const close = useCallback(() => {
    if (busy) return; // never disappear mid-flight
    setReq(null);
    setSteps([]);
    setFinished(null);
  }, [busy]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, close]);

  const run = useCallback(
    async (request: TxRequest) => {
      setReq(request);
      setFinished(null);
      setBusy(true);
      setSteps(request.steps.map((s) => ({ label: s.label, detail: s.detail, status: "waiting" })));

      const patch = (i: number, p: Partial<StepState>) =>
        setSteps((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...p } : s)));

      let ok = true;
      for (let i = 0; i < request.steps.length; i++) {
        patch(i, { status: "signing" });
        try {
          const hash = await request.steps[i].run();
          if (hash === null) {
            patch(i, { status: "skipped" });
            continue;
          }
          patch(i, { status: "done", hash });
        } catch (e: any) {
          const msg = readableError(e);
          if (msg === null) {
            patch(i, { status: "waiting" });
            setFinished("cancelled");
            ok = false;
            break;
          }
          patch(i, { status: "failed", error: msg });
          ok = false;
          break;
        }
      }

      setBusy(false);
      if (ok) {
        setFinished("ok");
        bump(); // tell the rest of the app to refetch
      } else if (finished !== "cancelled") {
        setFinished((f) => f ?? "failed");
      }
      request.onSettled?.(ok);
    },
    [bump, finished]
  );

  const value = useMemo(() => ({ run, busy }), [run, busy]);

  return (
    <TxCtx.Provider value={value}>
      {children}
      {req && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tx-modal-title"
          onClick={close}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-ink-700 px-5 py-4">
              <div className="min-w-0">
                <h2 id="tx-modal-title" className="text-[14px] font-semibold text-gray-100">
                  {req.title}
                </h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-400">
                  {req.description}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                aria-label="Close"
                className="shrink-0 rounded p-1 text-gray-600 transition hover:bg-ink-800 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            {/* Facts */}
            {req.facts && req.facts.length > 0 && (
              <ul className="divide-y divide-ink-700/70 border-b border-ink-700 text-[12.5px]">
                {req.facts.map(([k, v]) => (
                  <li key={k} className="flex items-baseline justify-between gap-3 px-5 py-2">
                    <span className="text-gray-500">{k}</span>
                    <span className="mono truncate text-right text-gray-200">{v}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Steps */}
            <ol className="divide-y divide-ink-700/70">
              {steps.map((s, i) => {
                const link = s.hash ? txUrl(chainId, s.hash) : null;
                return (
                  <li key={i} className="flex gap-3 px-5 py-3.5">
                    <span className="mt-0.5 shrink-0">
                      {s.status === "done" && <CheckCircle2 size={16} className="text-up" aria-hidden />}
                      {s.status === "skipped" && <CheckCircle2 size={16} className="text-gray-700" aria-hidden />}
                      {s.status === "failed" && <CircleAlert size={16} className="text-down" aria-hidden />}
                      {(s.status === "signing" || s.status === "pending") && (
                        <Loader2 size={16} className="animate-spin text-model" aria-hidden />
                      )}
                      {s.status === "waiting" && (
                        <span className="block h-4 w-4 rounded-full border border-ink-700" aria-hidden />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[13px] ${
                          s.status === "waiting" ? "text-gray-600" : "text-gray-200"
                        }`}
                      >
                        {s.label}
                        {s.status === "skipped" && (
                          <span className="ml-2 font-mono text-[10.5px] text-gray-600">
                            not needed
                          </span>
                        )}
                      </p>

                      {s.status === "signing" && (
                        <p className="mt-1 font-mono text-[11px] text-model">
                          confirm in your wallet…
                        </p>
                      )}
                      {s.detail && s.status === "waiting" && (
                        <p className="mt-1 text-[11.5px] text-gray-600">{s.detail}</p>
                      )}
                      {s.error && (
                        <p className="mt-1 font-mono text-[11px] leading-relaxed text-down">
                          {s.error}
                        </p>
                      )}
                      {s.hash && (
                        <p className="mt-1.5 flex items-center gap-1.5">
                          <span className="mono truncate text-[11px] text-gray-500">{s.hash}</span>
                          {link && (
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-gray-600 transition hover:text-model"
                              aria-label="View on the block explorer"
                            >
                              <ExternalLink size={12} aria-hidden />
                            </a>
                          )}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-ink-700 px-5 py-3.5">
              <span className="font-mono text-[11px]">
                {busy && <span className="text-model">in progress — do not close</span>}
                {finished === "ok" && <span className="text-up">confirmed on-chain</span>}
                {finished === "failed" && <span className="text-down">failed</span>}
                {finished === "cancelled" && <span className="text-gray-500">cancelled in wallet</span>}
              </span>

              <div className="flex gap-2">
                {(() => {
                  const last = [...steps].reverse().find((s) => s.hash);
                  const link = last?.hash ? txUrl(chainId, last.hash) : null;
                  return link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="btn-secondary">
                      View on explorer ↗
                    </a>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Working…" : "Close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </TxCtx.Provider>
  );
}
