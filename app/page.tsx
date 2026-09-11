import Link from "next/link";
import { HeroPanel } from "./components/HeroPanel";
import { Reveal, Stagger } from "./components/Reveal";

/**
 * Meritr landing page.
 *
 * Server-rendered apart from the live risk panel, so the argument paints before any JavaScript
 * runs. The section order deliberately puts the limitations *before* the mechanism: a credit
 * protocol that leads with what it cannot do earns the right to be believed about what it can.
 */

const GITHUB = "https://github.com/mrnetwork0001/Meritr";
const EXPLORER = "https://creditcoin.blockscout.com";
const PRECOMPILE = "0x0000000000000000000000000000000000000FD2";

const NAV = [
  ["How it works", "#how"],
  ["The guarantee", "#guarantee"],
  ["Evidence", "#evidence"],
  ["Run it", "#build"],
];

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
  lede?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="section">
      <div className="mx-auto w-full max-w-page px-4 sm:px-6">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="h2 mt-2">{title}</h2>
          {lede && <div className="lede">{lede}</div>}
        </Reveal>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="bg-ink-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-model focus:px-3 focus:py-2 focus:text-ink-950"
      >
        Skip to main content
      </a>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-ink-700/70 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-page items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center" aria-label="Meritr, home">
            {/* Intrinsic size is declared so the nav never reflows once the image lands. */}
            <img
              src="/brand/meritr-header.png"
              alt="Meritr"
              width={720}
              height={107}
              className="h-7 w-auto"
            />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="nav-link">
                {label}
              </a>
            ))}
            <a href={GITHUB} target="_blank" rel="noreferrer" className="nav-link">
              GitHub
            </a>
          </div>

          <Link href="/app" className="btn-primary">
            Launch app →
          </Link>
        </div>
      </nav>

      <main id="main">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <header className="border-b border-ink-700/70">
          <div className="mx-auto grid max-w-page items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
            <div>
              <div className="hero-in flex flex-wrap gap-2">
                <span className="chip">Creditcoin mainnet · 102030</span>
                <span className="chip">Attestcoin · 0xFD2</span>
              </div>

              <h1 className="hero-in mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-gray-50 sm:text-5xl">
                Prove the history.
                <br />
                Keep the collateral.
              </h1>

              <p className="hero-in mt-5 max-w-xl text-pretty text-[16px] leading-relaxed text-gray-400">
                Every lending market answers borrower distress with one action: seizure. Meritr
                reads a borrower&apos;s real Aave repayment history off Ethereum through
                Creditcoin&apos;s Attestcoin verifier — no oracle operator in the path — and lets
                an autonomous agent restructure a stressed loan instead of liquidating it.
              </p>

              <div className="hero-in mt-8 flex flex-wrap items-center gap-3">
                <Link href="/app" className="btn-primary">
                  Launch app →
                </Link>
                <a href="#evidence" className="btn-secondary">
                  Does it work?
                </a>
              </div>
            </div>

            <div className="hero-in">
              <HeroPanel />
            </div>
          </div>
        </header>

        {/* ── The honest part ───────────────────────────────────────────── */}
        <Section
          eyebrow="the honest part"
          title="What Meritr cannot do yet."
          lede={
            <>
              A credit protocol that hides its assumptions is not one anyone should use. Four
              limits are load-bearing enough to belong above the pitch rather than in a footnote.
            </>
          }
        >
          <Reveal>
            <Stagger className="grid gap-4 md:grid-cols-2">
              {[
                {
                  h: "No real proof has been produced end-to-end",
                  p: "The decoding path is real — MeritrAttestor inherits Creditcoin's ASCBase and calls 0xFD2 — but every proof in the repo is built by test fixtures. Producing a genuine prover envelope needs Creditcoin's block-prover service, and that has not been wired.",
                },
                {
                  h: "Only Ethereum is attested on mainnet",
                  p: "Creditcoin's ChainInfo precompile registers exactly one source chain on 102030: Ethereum, chainKey 1. Base is not available, so cross-chain today means one chain plus the machinery to add more the moment they are registered.",
                },
                {
                  h: "Collateral marks are governance-fed",
                  p: "Every credit fact carries a proof, but the vault's own collateral price is set behind PRICE_ROLE. It is the single trusted input in the risk path, and production needs a real feed.",
                },
                {
                  h: "The passport commitment is a hash, not a SNARK",
                  p: "factsCommitment binds a borrower's exact attested inputs so they can disclose selectively and have it checked. It hides values; it proves nothing about them. It is the substitution point for a range proof, not the range proof.",
                },
              ].map((c, i) => (
                <div key={c.h} style={{ "--n": i } as React.CSSProperties}>
                  <div className="card h-full">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 font-mono text-down">✕</span>
                      <div>
                        <h3 className="text-[14px] font-semibold text-gray-100">{c.h}</h3>
                        <p className="mt-2 text-[13px] leading-relaxed text-gray-400">{c.p}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </Stagger>
          </Reveal>

          <Reveal delay={70}>
            <div className="mt-4 rounded-lg border border-up/25 bg-up/[0.06] p-5">
              <p className="text-[14.5px] leading-relaxed text-gray-200">
                <span className="font-semibold text-up">What is real is the part that matters.</span>{" "}
                The verifier call, the log decoding, the replay and emitter defences, the scoring
                model and the restructuring mechanism are all implemented and tested. What is
                missing is a proof <em className="not-italic text-gray-100">producer</em> — not
                proof <em className="not-italic text-gray-100">handling</em>.
              </p>
            </div>
          </Reveal>
        </Section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <Section
          id="how"
          eyebrow="how it works"
          title="Proof in. Credit out. Restructuring before seizure."
          lede="Three stages. The Creditcoin runtime validates the source-chain proof itself, so there is no oracle operator, no multisig relayer and no trusted price poster anywhere in the ingestion path."
        >
          <Reveal>
            <Stagger className="grid gap-4 md:grid-cols-3">
              {[
                {
                  n: "01",
                  h: "Attest",
                  p: "A borrower's Aave V3 repayments, supplies and liquidations on Ethereum are proven to Creditcoin through the native query verifier precompile at 0xFD2 — Merkle inclusion plus continuity. Submission is permissionless because the proof is self-validating.",
                  k: "credit accrues to the address inside the proven log, never to the submitter",
                },
                {
                  n: "02",
                  h: "Score",
                  p: "Proven logs are decoded against an on-chain event schema registry and folded into a portable 300–900 score across five weighted components. A wallet with nothing proven scores exactly 300.",
                  k: "no unearned credit anywhere in the curve",
                },
                {
                  n: "03",
                  h: "Restructure",
                  p: "Between healthy and liquidatable sits a stress band. Inside it an agent cuts the rate, extends the term, and retires debt from an interest-fed reserve until the position is healthy again.",
                  k: "the borrower keeps every unit of collateral",
                },
              ].map((s, i) => (
                <div key={s.n} style={{ "--n": i } as React.CSSProperties}>
                  <div className="card h-full">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded border border-model/40 bg-model/[0.08] px-2 py-0.5 font-mono text-[11px] font-bold text-model">
                        {s.n}
                      </span>
                      <h3 className="text-[14px] font-semibold text-gray-100">{s.h}</h3>
                    </div>
                    <p className="mt-3 text-[13px] leading-relaxed text-gray-400">{s.p}</p>
                    <p className="mt-3 border-t border-ink-700 pt-3 font-mono text-[11px] leading-relaxed text-gray-500">
                      {s.k}
                    </p>
                  </div>
                </div>
              ))}
            </Stagger>
          </Reveal>
        </Section>

        {/* ── The guarantee ─────────────────────────────────────────────── */}
        <Section
          id="guarantee"
          eyebrow="the guarantee"
          title="The AI decides whom. The chain decides how much."
          lede="This is the load-bearing decision in the whole protocol, and it is one function signature."
        >
          <div className="grid min-w-0 gap-4 lg:grid-cols-[1.1fr_1fr]">
            <Reveal>
              <div className="card p-0">
                <div className="border-b border-ink-700 px-5 py-3">
                  <h3 className="text-[13px] font-semibold text-gray-200">
                    MeritrVault.sol — the entire agent-facing surface
                  </h3>
                </div>
                <div className="px-5 py-5">
                  <div className="formula rounded border border-ink-700 bg-ink-950 p-3">
                    <div>
                      function <em>restructure</em>(address borrower)
                    </div>
                    <div className="pl-4">external returns (uint256, uint256, uint256);</div>
                  </div>
                  <p className="mt-4 text-[13px] leading-relaxed text-gray-400">
                    One argument. No rate, no amount, no score, no signature over off-chain
                    numbers. The vault re-reads the borrower&apos;s score from the attestor and
                    recomputes every term through the same library the agent used.
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-gray-400">
                    A fully compromised agent key can trigger restructurings the protocol would
                    already have approved, and{" "}
                    <span className="text-gray-200">nothing else</span>.
                  </p>
                </div>

                <div className="border-t border-ink-700 px-5 py-3">
                  <p className="mb-2.5 font-mono text-[11px] text-gray-500">
                    three levers, applied in increasing cost to the protocol
                  </p>
                  <ul className="divide-y divide-ink-700/70 text-[12.5px]">
                    {[
                      ["Rate relief", "free", "reprice to the borrower's earned rate"],
                      ["Term extension", "free", "+30 days, buying time without a forced sale"],
                      ["Micro-refinance", "reserve", "retire debt until health returns to 1.35"],
                    ].map(([a, b, c], i) => (
                      <li key={a} className={`py-2.5 sm:flex sm:items-baseline sm:gap-3 ${i === 2 ? "text-model" : ""}`}>
                        <span className={`block font-mono sm:w-[8.5rem] sm:shrink-0 ${i === 2 ? "font-bold text-model" : "text-gray-300"}`}>
                          {a}
                        </span>
                        <span className={`mt-0.5 block font-mono text-[11px] sm:mt-0 sm:w-[4.5rem] sm:shrink-0 ${i === 2 ? "text-model/80" : "text-gray-600"}`}>
                          {b}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-gray-500 sm:mt-0">{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>

            <Reveal delay={70}>
              <div className="min-w-0 space-y-4">
                <div className="card">
                  <h3 className="text-[14px] font-semibold text-gray-100">
                    Verified, not asserted
                  </h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-gray-400">
                    The Python agent mirrors the Solidity scoring library exactly, integer
                    truncation included. 168 vectors generated from the deployed contract assert
                    every component of every score matches.
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-gray-400">
                    A one-wei divergence is a build failure, not a rounding curiosity — the
                    agent is only useful if it predicts the chain&apos;s own arithmetic.
                  </p>
                </div>

                <div className="card">
                  <h3 className="text-[14px] font-semibold text-gray-100">
                    Not a liveness dependency
                  </h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-gray-400">
                    If the agent goes offline while a position is stressed, anyone may trigger
                    the identical restructuring after a six-hour grace period. Borrower
                    protection does not hinge on a server staying up.
                  </p>
                </div>

                <div className="card">
                  <h3 className="text-[14px] font-semibold text-gray-100">
                    Relief is funded, not conjured
                  </h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-gray-400">
                    The reserve accrues from 15% of realised interest.{" "}
                    <code className="inline">totalAssets()</code> excludes it, so a lender can
                    never withdraw the capital earmarked to keep borrowers solvent.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ── Evidence ──────────────────────────────────────────────────── */}
        <Section
          id="evidence"
          eyebrow="what we measured"
          title="Where the score comes from, and what it buys."
          lede="The scoring model is deterministic and public. Same facts in, same terms out — on-chain and off — which is what makes the parity suite possible at all."
        >
          <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_1.1fr]">
            <Reveal>
              <div className="card p-0">
                <div className="border-b border-ink-700 px-5 py-3">
                  <h3 className="text-[13px] font-semibold text-gray-200">Score components</h3>
                </div>
                <ul className="divide-y divide-ink-700/70 text-[12.5px]">
                  {[
                    ["Repayment history", "35%", "$250k / 40 events"],
                    ["Cross-chain collateral", "25%", "$150k supplied"],
                    ["Wallet maturity", "15%", "730 days"],
                    ["Chain diversity", "10%", "4 chains"],
                    ["Liquidation safety", "15%", "−30% compounding"],
                  ].map(([a, b, c]) => (
                    <li key={a} className="px-5 py-2.5 sm:flex sm:items-baseline sm:gap-3">
                      <span className="block text-gray-300 sm:flex-1">{a}</span>
                      <span className="mono mt-0.5 block text-[12px] text-model sm:mt-0 sm:w-12 sm:shrink-0">
                        {b}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-gray-600 sm:mt-0 sm:w-[8.5rem] sm:shrink-0 sm:text-right">
                        {c}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-ink-700 px-5 py-3">
                  <p className="font-mono text-[11px] leading-relaxed text-gray-500">
                    a wallet with zero proofs scores exactly 300 — safety is withheld until
                    something is proven, because no evidence is not the same as proven safety
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={70}>
              <div className="min-w-0 space-y-4">
                <div className="card p-0">
                  <div className="border-b border-ink-700 px-5 py-3">
                    <h3 className="text-[13px] font-semibold text-gray-200">
                      What a score buys, end to end
                    </h3>
                  </div>
                  <ul className="divide-y divide-ink-700/70 text-[12.5px]">
                    {[
                      ["score 300", "24.00% APR", "30% LTV", "nothing proven"],
                      ["score 535", "16.17% APR", "49.6% LTV", "8 repayments"],
                      ["score 765", "8.50% APR", "68.8% LTV", "17 proofs, 2 chains"],
                      ["score 900", "4.00% APR", "80% LTV", "fully saturated"],
                    ].map(([a, b, c, d], i) => (
                      <li
                        key={a}
                        className={`px-5 py-2.5 sm:flex sm:items-baseline sm:gap-3 ${i === 2 ? "bg-model/[0.08]" : ""}`}
                      >
                        <span className={`mono block sm:w-[5.5rem] sm:shrink-0 ${i === 2 ? "font-bold text-model" : "text-gray-300"}`}>
                          {a}
                        </span>
                        <span className="mono mt-0.5 block text-[12px] text-gray-300 sm:mt-0 sm:w-[6rem] sm:shrink-0">
                          {b}
                        </span>
                        <span className="mono mt-0.5 block text-[12px] text-gray-400 sm:mt-0 sm:w-[5rem] sm:shrink-0">
                          {c}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-gray-600 sm:mt-0">{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    ["48", "contract tests"],
                    ["39", "agent tests"],
                    ["168", "parity vectors"],
                    ["0", "oracle operators"],
                  ].map(([n, l], i) => (
                    <div key={l} style={{ "--n": i } as React.CSSProperties}>
                      <div className="card h-full text-center">
                        <p className="mono text-2xl font-bold text-gray-100">{n}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-gray-600">
                          {l}
                        </p>
                      </div>
                    </div>
                  ))}
                </Stagger>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ── Under the hood ────────────────────────────────────────────── */}
        <Section
          id="build"
          eyebrow="under the hood"
          title="Four subsystems, and a way to run all of them."
          lede="Everything below is in the repository under Apache 2.0."
        >
          <div className="grid min-w-0 gap-4 lg:grid-cols-[1.1fr_1fr]">
            <Reveal>
              <div className="card p-0">
                <div className="border-b border-ink-700 px-5 py-3">
                  <h3 className="text-[13px] font-semibold text-gray-200">Modules</h3>
                </div>
                <ul className="divide-y divide-ink-700/70 text-[12.5px]">
                  {[
                    ["MeritrAttestor.sol", "ingestion", "inherits ASCBase; on-chain event schema registry"],
                    ["MeritrVault.sol", "credit", "score-priced lending + autonomous restructuring"],
                    ["MeritrPassport.sol", "identity", "soulbound ERC-721, fully on-chain SVG"],
                    ["CreditMath.sol", "model", "scoring, pricing curves, health math"],
                    ["agents/underwriter.py", "agent", "discover, assess, triage, simulate, broadcast"],
                    ["backend/main.py", "api", "read-mostly; derives everything from chain state"],
                  ].map(([a, b, c]) => (
                    <li key={a} className="px-5 py-2.5 sm:flex sm:items-baseline sm:gap-3">
                      <span className="block font-mono text-gray-300 sm:w-[11rem] sm:shrink-0">
                        {a}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-model/80 sm:mt-0 sm:w-[5rem] sm:shrink-0">
                        {b}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-gray-500 sm:mt-0">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={70}>
              <div className="space-y-4">
                <div className="card">
                  <h3 className="text-[14px] font-semibold text-gray-100">Run it yourself</h3>
                  <div className="formula mt-3 space-y-1 rounded border border-ink-700 bg-ink-950 p-3">
                    <div>npm install &amp;&amp; pip install -r requirements.txt</div>
                    <div>npx hardhat test <em># 48 passing</em></div>
                    <div>pytest <em># 39 passing</em></div>
                    <div>npx hardhat run scripts/simulate.js</div>
                  </div>
                  <p className="mt-3 text-[13px] leading-relaxed text-gray-400">
                    The simulation walks the full thesis in six acts against live chain state —
                    an unattested wallet quoted 24% APR, proofs ingested, terms improving on
                    their own, then a 34% collateral drawdown restructured rather than seized.
                  </p>
                </div>

                <div className="card">
                  <h3 className="text-[14px] font-semibold text-gray-100">Built with</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      "Creditcoin mainnet 102030",
                      "Attestcoin 0xFD2",
                      "@gluwa/asc-contracts",
                      "Solidity 0.8.28",
                      "Next.js 14",
                      "Python 3.11 · FastAPI",
                      "web3.py",
                      "Hardhat",
                    ].map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section className="border-t border-ink-700/70 py-16">
          <div className="mx-auto max-w-page px-4 text-center sm:px-6">
            <Reveal>
              <h2 className="h2 text-balance">See a stressed loan rescued in real time.</h2>
              <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-gray-400">
                The dashboard shows the live risk book, each borrower&apos;s cross-chain credit
                memory, and the agent&apos;s reasoning for the position it chose to act on first.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link href="/app" className="btn-primary">
                  Launch app →
                </Link>
                <a href={GITHUB} target="_blank" rel="noreferrer" className="btn-secondary">
                  View source
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-ink-700/70 bg-ink-950 pb-14 pt-14">
        <div className="mx-auto max-w-page px-4 sm:px-6">
          <div className="grid gap-y-9 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-8">
            <div className="max-w-md">
              <Link href="/" className="inline-block" aria-label="Meritr, home">
                <img
                  src="/brand/meritr-header.png"
                  alt="Meritr"
                  width={720}
                  height={107}
                  className="h-10 w-auto sm:h-11"
                />
              </Link>
              <p className="mt-6 text-[15px] leading-relaxed text-gray-400">
                Reads a borrower&apos;s real repayment history from Ethereum through
                Creditcoin&apos;s Attestcoin verifier, scores it into portable credit, and
                restructures distressed loans before they can be liquidated — so a temporary
                drawdown stops costing borrowers their collateral.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="chip">Apache 2.0</span>
                <span className="chip">BUIDL CTC 2026</span>
              </div>
            </div>

            {[
              {
                title: "Product",
                links: [
                  ["Launch app", "/app"],
                  ["How it works", "/#how"],
                  ["The guarantee", "/#guarantee"],
                  ["Evidence", "/#evidence"],
                  ["Run it yourself", "/#build"],
                ],
              },
              {
                title: "Resources",
                links: [
                  ["README", `${GITHUB}/blob/main/README.md`],
                  ["Architecture note", `${GITHUB}/blob/main/docs/ARCHITECTURE.md`],
                  ["Contracts", `${GITHUB}/tree/main/contracts`],
                  ["DeAI agent", `${GITHUB}/tree/main/agents`],
                  ["Test suites", `${GITHUB}/tree/main/test`],
                ],
              },
              {
                title: "Ecosystem",
                links: [
                  ["Creditcoin", "https://creditcoin.org"],
                  ["Blockscout explorer", EXPLORER],
                  ["@gluwa/asc-contracts", "https://www.npmjs.com/package/@gluwa/asc-contracts"],
                  ["Attestcoin precompile", `${EXPLORER}/address/${PRECOMPILE}`],
                  ["BUIDL CTC Hackathon", "https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail"],
                ],
              },
            ].map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-model">
                  {col.title}
                </p>
                <ul className="mt-3.5 space-y-1.5">
                  {col.links.map(([label, href]) => {
                    const external = href.startsWith("http");
                    return (
                      <li key={label}>
                        <a
                          href={href}
                          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                          className="block py-0.5 text-[14.5px] leading-snug text-gray-300 transition hover:text-model"
                        >
                          {label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ))}
          </div>

          <p className="mt-12 border-t border-ink-700/70 pt-6 text-[11px] leading-relaxed text-gray-600">
            Meritr&apos;s contracts have not been audited and nothing is deployed to mainnet yet.
            Collateral marks are governance-fed, and the passport&apos;s facts commitment is a
            hash commitment rather than a zero-knowledge proof. These limits are documented in
            full in the repository.
          </p>
        </div>
      </footer>
    </div>
  );
}
