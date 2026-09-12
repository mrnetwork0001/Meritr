"use client";

import { useState } from "react";
import { isAddress, getAddress } from "ethers";

/**
 * Look up any address's credit memory, with the proven borrowers offered directly.
 *
 * The lending book holds only wallets that have borrowed here, and none of them has an
 * Attestcoin-proven history - so the passport, which is the point of the whole project,
 * rendered every component at zero for anyone who simply opened the page. The proven history
 * belongs to real Ethereum addresses that have never touched Creditcoin, and the only way to
 * see it was to know one and paste it in.
 *
 * These three are the highest-scoring of them, read from chain. Their histories are public
 * Aave activity, and nothing here needs their consent: the console only reads what the
 * precompile already verified.
 */
const PROVEN: Array<{ address: string; score: number; facts: number }> = [
  { address: "0x76f30e3f75437fB862B8D2C4D80a671bCeBA5b1A", score: 785, facts: 29 },
  { address: "0x9205A569B0ff45dF1E4f5ae48E21bC7F0656f0BB", score: 774, facts: 29 },
  { address: "0x5aAE4d2f360e156De3416936049837A7Bb685588", score: 758, facts: 12 },
];

export function BorrowerLookup({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (address: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const v = draft.trim();
    if (!isAddress(v)) {
      setErr("That is not an address.");
      return;
    }
    setErr(null);
    setDraft("");
    onSelect(getAddress(v));
  };

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-gray-200">Any address, not just borrowers here</p>
        <p className="font-mono text-[10px] text-gray-600">credit memory is read, never registered</p>
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">
        Meritr scores addresses that have never touched Creditcoin, because their history was
        proven rather than reported. These three carry the most.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {PROVEN.map((p) => {
          const on = selected?.toLowerCase() === p.address.toLowerCase();
          return (
            <button
              key={p.address}
              type="button"
              onClick={() => onSelect(p.address)}
              className={`rounded border px-2.5 py-1.5 font-mono text-[11px] transition ${
                on
                  ? "border-model bg-model/10 text-model"
                  : "border-[var(--color-line)] text-gray-400 hover:border-[var(--color-line-strong)] hover:text-gray-200"
              }`}
              title={`${p.facts} Attestcoin-proven facts`}
            >
              {p.address.slice(0, 6)}…{p.address.slice(-4)}
              <span className="ml-2 text-up">{p.score}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="0x…"
          spellCheck={false}
          className="min-w-0 flex-1 rounded border border-[var(--color-line)] bg-ink-950 px-3 py-1.5 font-mono text-[12px] text-gray-200 outline-none placeholder:text-gray-700 focus:border-[var(--color-line-strong)]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="btn-ghost px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Look up
        </button>
      </div>
      {err && <p className="mt-1.5 font-mono text-[10.5px] text-down">{err}</p>}
    </div>
  );
}
