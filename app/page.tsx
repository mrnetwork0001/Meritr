import Link from "next/link";
import { LiveStats } from "./components/LiveStats";

/**
 * Meritr landing page.
 *
 * A server component by default — the only interactive island is LiveStats, so the page paints
 * its full argument before any JavaScript runs. That matters for a page whose job is to make a
 * case to a reader who may never click anything.
 */

const GITHUB = "https://github.com/mrnetwork0001/Meritr";
const PRECOMPILE = "0x0000000000000000000000000000000000000FD2";
const EXPLORER = "https://creditcoin.blockscout.com";

/* ── small presentational primitives ─────────────────────────────────────── */

function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t border-ink-700/60 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <p className="label text-accent">{eyebrow}</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-mist-100 sm:text-4xl">
          {title}
        </h2>
        {lede && <p className="mt-4 max-w-2xl text-base leading-relaxed text-mist-400">{lede}</p>}
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

function LaunchButton({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <Link
      href="/app"
      className={`group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-accent to-credit font-semibold text-ink-900 shadow-lg shadow-accent/20 transition-all hover:shadow-xl hover:shadow-accent/30 hover:brightness-110 ${
        size === "lg" ? "px-8 py-4 text-base" : "px-5 py-2.5 text-sm"
      }`}
    >
      Launch App
      <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
        →
      </span>
    </Link>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-ink-700/60 bg-ink-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-credit font-mono text-sm font-bold text-ink-900">
              M
            </span>
            <span className="text-lg font-semibold tracking-tight text-mist-100">Meritr</span>
          </Link>

          <div className="hidden items-center gap-7 text-sm text-mist-400 md:flex">
            <a href="#problem" className="transition-colors hover:text-mist-100">Problem</a>
            <a href="#how" className="transition-colors hover:text-mist-100">How it works</a>
            <a href="#trust" className="transition-colors hover:text-mist-100">Trust model</a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="transition-colors hover:text-mist-100">
              GitHub
            </a>
          </div>

          <LaunchButton />
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-24 sm:pt-32">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip border-credit/30 bg-credit/10 text-credit">
              <span className="h-1.5 w-1.5 rounded-full bg-credit animate-pulse-soft" />
              Creditcoin Mainnet · Chain 102030
            </span>
            <span className="chip border-ink-500 bg-ink-700/60 text-mist-400">
              Attestcoin precompile {PRECOMPILE.slice(0, 10)}…0FD2
            </span>
          </div>

          <h1 className="mt-8 max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight text-mist-100 sm:text-6xl">
            Your credit history is{" "}
            <span className="bg-gradient-to-r from-accent to-credit bg-clip-text text-transparent">
              already on-chain
            </span>
            . Meritr makes it provable — and stops liquidations before they start.
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-mist-400">
            Meritr ingests your real repayment history from Ethereum and Base through Creditcoin&apos;s
            Attestcoin verifier precompile — no oracle operator anywhere in the path — then lets an
            autonomous agent <strong className="font-medium text-mist-200">restructure distressed
            loans instead of seizing them</strong>.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <LaunchButton size="lg" />
            <a
              href={GITHUB}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost px-6 py-4 text-base"
            >
              View source
            </a>
          </div>

          <div className="mt-16">
            <LiveStats />
          </div>
        </div>
      </header>

      {/* Problem */}
      <Section
        id="problem"
        eyebrow="The problem"
        title="On-chain credit is amnesiac and brutal."
      >
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              tag: "Amnesiac",
              color: "#FBBF24",
              head: "Three years of flawless repayments, worth nothing on a new chain.",
              body: "A borrower with a spotless Aave record on Ethereum arrives on another chain as a stranger. Their history is real and public — but unusable, because no contract there can verify it without trusting an oracle operator to report it honestly.",
            },
            {
              tag: "Brutal",
              color: "#F87171",
              head: "Every lending market answers distress with exactly one action.",
              body: "A temporary 30% drawdown destroys the borrower's equity, dumps collateral into a falling market, pays a bonus to a liquidation bot, and permanently ends a paying customer relationship. Traditional finance restructures distressed debt every day. DeFi seizes it.",
            },
          ].map((c) => (
            <div key={c.tag} className="card card-pad">
              <span
                className="chip"
                style={{ color: c.color, borderColor: `${c.color}44`, background: `${c.color}14` }}
              >
                {c.tag}
              </span>
              <h3 className="mt-4 text-lg font-medium leading-snug text-mist-100">{c.head}</h3>
              <p className="mt-3 text-sm leading-relaxed text-mist-400">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section
        id="how"
        eyebrow="How it works"
        title="Proof in. Credit out. Restructuring before liquidation."
        lede="Four stages, each verifiable by anyone with an RPC endpoint. The Creditcoin runtime itself validates the source-chain proof — there is no oracle operator, no multisig relayer and no trusted price poster in this path."
      >
        <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              n: "01",
              c: "#818CF8",
              t: "Source chains",
              d: "Aave V3 repayments, supplies and liquidations on Ethereum and Base — activity that already happened, publicly.",
            },
            {
              n: "02",
              c: "#7DF9FF",
              t: "Attestcoin precompile",
              d: "The native query verifier at 0xFD2 checks Merkle inclusion and continuity. A submission either carries a proof the runtime accepts, or it reverts.",
            },
            {
              n: "03",
              c: "#34D399",
              t: "Credit memory",
              d: "Proven logs are decoded against a registered event schema and folded into a portable 300–900 score. An unattested wallet scores exactly 300.",
            },
            {
              n: "04",
              c: "#FBBF24",
              t: "Autonomous restructuring",
              d: "Distress triggers rate relief, a term extension, and reserve-funded refinancing back to health — with the collateral untouched.",
            },
          ].map((s) => (
            <li key={s.n} className="card card-pad">
              <span className="font-mono text-xs font-semibold" style={{ color: s.c }}>
                {s.n}
              </span>
              <h3 className="mt-3 text-base font-medium text-mist-100">{s.t}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-mist-400">{s.d}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Trust model / key decision */}
      <Section
        id="trust"
        eyebrow="The load-bearing decision"
        title="The AI decides whom. The chain decides how much."
        lede="This is what makes an autonomous agent safe to point at user debt."
      >
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-ink-600 px-5 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-watch/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-healthy/60" />
                <span className="ml-2 font-mono text-[11px] text-mist-500">MeritrVault.sol</span>
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-mist-300">
{`function restructure(address borrower)
    external
    returns (uint256, uint256, uint256);`}
              </pre>
              <div className="border-t border-ink-600 px-5 py-4">
                <p className="text-sm text-mist-400">
                  <span className="text-mist-200">One argument.</span> No rate. No amount. No score.
                  No signature over off-chain numbers.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-2">
            <p className="text-sm leading-relaxed text-mist-400">
              The vault re-reads the borrower&apos;s score from the attestor — whose every input
              carries an Attestcoin proof — and recomputes each term through the same library the
              off-chain agent used.
            </p>
            <p className="text-sm leading-relaxed text-mist-400">
              A fully compromised agent key can trigger restructurings the protocol would already
              have approved, and nothing else. It cannot invent a score, grant itself a rate, or
              drain the reserve.
            </p>
            <div className="rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
              <p className="text-xs leading-relaxed text-mist-400">
                <span className="font-medium text-accent">Verified, not asserted.</span> The Python
                agent mirrors the Solidity library exactly, integer truncation included — 168
                vectors generated from the deployed contract assert every component of every score
                matches. A one-wei divergence fails the build.
              </p>
            </div>
            <div className="rounded-xl border border-healthy/25 bg-healthy/[0.06] p-4">
              <p className="text-xs leading-relaxed text-mist-400">
                <span className="font-medium text-healthy">Not a liveness dependency.</span> If the
                agent goes offline while a position is stressed, anyone may trigger the identical
                restructuring after a six-hour grace period.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Subsystems */}
      <Section
        eyebrow="What's deployed"
        title="Four subsystems, on Creditcoin mainnet."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            {
              t: "MeritrAttestor",
              s: "Attestcoin ingestion",
              d: "Inherits Creditcoin's canonical ASCBase. Ingestion is permissionless because the proof is self-validating — credit accrues to the address inside the proven log, never to the submitter.",
            },
            {
              t: "MeritrVault",
              s: "Autonomous restructuring",
              d: "A stress band between healthy and liquidatable. Relief is drawn from an interest-fed reserve, never from lender principal, and refused outright below a health factor of 1.0.",
            },
            {
              t: "MeritrPassport",
              s: "Soulbound credit passport",
              d: "Non-transferable at the ERC-721 chokepoint, so a pristine score can never be farmed on a clean wallet and sold to a defaulter. Metadata is fully on-chain.",
            },
            {
              t: "Underwriting agent",
              s: "DeAI risk engine",
              d: "Rebuilds its entire working set from the vault's own logs. Ranks stressed positions by the loss an intervention averts, because the reserve is finite and order matters.",
            },
          ].map((c) => (
            <div key={c.t} className="card card-pad">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-mono text-base font-medium text-mist-100">{c.t}</h3>
                <span className="text-[11px] uppercase tracking-wider text-mist-500">{c.s}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-mist-400">{c.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4">
          {[
            ["48", "contract tests"],
            ["39", "agent tests"],
            ["168", "parity vectors"],
            ["0", "oracle operators"],
          ].map(([n, l]) => (
            <div key={l} className="card card-pad text-center">
              <p className="font-mono text-3xl font-semibold text-mist-100 tabular-nums">{n}</p>
              <p className="label mt-1.5">{l}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <section className="border-t border-ink-700/60 py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-mist-100 sm:text-4xl">
            See a stressed loan rescued in real time.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-mist-400">
            The dashboard shows the live risk book, each borrower&apos;s cross-chain credit
            memory, and the agent&apos;s reasoning for the position it chose to act on first.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <LaunchButton size="lg" />
            <a href={GITHUB} target="_blank" rel="noreferrer" className="btn-ghost px-6 py-4 text-base">
              Read the architecture
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-700/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 text-[11px] text-mist-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Meritr · Apache 2.0 · BUIDL CTC 2026 Fall Hackathon · Creditcoin &amp; Credit Labs
          </p>
          <div className="flex flex-wrap gap-4 font-mono">
            <a href={EXPLORER} target="_blank" rel="noreferrer" className="transition-colors hover:text-mist-300">
              Explorer
            </a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="transition-colors hover:text-mist-300">
              GitHub
            </a>
            <span>Chain 102030</span>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-6xl px-6 text-[10px] leading-relaxed text-mist-600">
          Meritr&apos;s contracts have not been audited. Collateral marks are governance-fed, and
          the passport&apos;s facts commitment is a hash commitment — not a zero-knowledge proof.
          These limits are documented in full in the repository.
        </p>
      </footer>
    </div>
  );
}
