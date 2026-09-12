import Link from "next/link";
import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";
import { HeroPanel } from "./components/HeroPanel";
import { HeroStats } from "./components/HeroStats";
import { Reveal } from "./components/Reveal";
import { BandsDiagram, LeversDiagram, ProofDiagram, ScoreDiagram } from "./components/Diagrams";
import { LiveStats } from "./components/LiveStats";

const EXPLORER = "https://creditcoin-testnet.blockscout.com";
const RESTRUCTURE_TX = "0x45f9963cd6dc535dfb7fb8670ecc9e5b2b329a6c7edac19df538dddadcb25be6";

/* ── content ─────────────────────────────────────────────────────────────── */

const PROBLEMS = [
  {
    title: "Your credit history does not travel",
    text: "Three years of flawless Aave repayments on Ethereum are worth nothing the moment you arrive on another chain. The record is real and public - and unusable, because nothing there can verify it without trusting an oracle operator to report it honestly.",
  },
  {
    title: "Distress has exactly one answer",
    text: "Every lending market seizes. A temporary drawdown destroys the borrower's equity, dumps collateral into a falling market, pays a bonus to a bot, and permanently ends a paying relationship. Traditional finance restructures distressed debt every day.",
  },
] as const;

const LIMITS = [
  {
    h: "The market's tokens are synthetic",
    p: "Creditcoin testnet has no canonical stablecoin, so the vault trades a demo pair Meritr deployed with an open mint. They are worth nothing - and they cannot reach the credit data, which is checkable in one grep.",
  },
  {
    h: "Collateral marks are governance-fed",
    p: "Every credit fact carries a proof. The vault's own collateral price does not: it is posted behind PRICE_ROLE from a live Chainlink feed. That is the single trusted input in the risk path.",
  },
  {
    h: "The commitment is a hash, not a SNARK",
    p: "The passport binds a borrower's exact attested inputs so they can disclose selectively and have it checked. It hides values; it proves nothing about them on its own. It is the substitution point for a range proof.",
  },
  {
    h: "The contracts are unaudited",
    p: "A CertiK audit is a hackathon prize, not a completed step. Mainnet deployment sits behind an explicit confirmation gate for exactly this reason.",
  },
] as const;

/* ── primitives ──────────────────────────────────────────────────────────── */

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
    <section id={id} className="scroll-mt-20 border-t border-[var(--color-line)] py-16 sm:py-24">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-3 max-w-3xl text-[26px] font-semibold text-balance text-[#f2f4f8] sm:text-[34px]">
            {title}
          </h2>
          {lede && (
            <div className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#8b93a5]">{lede}</div>
          )}
        </Reveal>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

/** Chrome that frames a diagram as a specimen rather than an illustration. */
function Frame({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-down/50" />
        <span className="h-2 w-2 rounded-full bg-warn/50" />
        <span className="h-2 w-2 rounded-full bg-up/50" />
        <span className="mono ml-2 text-[11px] text-[#5d6474]">{caption}</span>
      </div>
      <div className="px-4 py-6">{children}</div>
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function Landing() {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-model focus:px-3 focus:py-2 focus:text-ink-950"
      >
        Skip to main content
      </a>

      <SiteHeader />

      <main id="main">
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <header className="border-b border-[var(--color-line)]">
          <div className="wrap grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h1
                className="anim-rise max-w-2xl text-[40px] font-semibold leading-[1.04] text-balance text-[#f7f8fb] sm:text-[58px]"
              >
                Prove the history.
                <br />
                Keep the collateral.
              </h1>

              <p
                className="anim-rise mt-6 max-w-xl text-[16.5px] leading-relaxed text-[#8b93a5]"
                style={{ animationDelay: "120ms" }}
              >
                Meritr reads a borrower&apos;s real Aave repayment history off Ethereum through
                Creditcoin&apos;s Attestcoin verifier - no oracle operator anywhere in the path -
                and lets an autonomous agent restructure a stressed loan instead of liquidating it.
              </p>

              <div
                className="anim-rise mt-9 flex flex-wrap items-center gap-3"
                style={{ animationDelay: "180ms" }}
              >
                <Link href="/app" className="btn-primary px-6 py-3 text-[14px]">
                  Launch app
                </Link>
                <a href="#evidence" className="btn-ghost px-6 py-3 text-[14px]">
                  Does it work?
                </a>
              </div>
            </div>

            <div className="anim-rise" style={{ animationDelay: "240ms" }}>
              <HeroPanel />
            </div>
          </div>
        </header>

        {/* ── Outcome strip ──────────────────────────────────────────── */}
        <section className="border-b border-[var(--color-line)]">
          <HeroStats />
        </section>

        {/* ── Problem ────────────────────────────────────────────────── */}
        <Section
          id="problem"
          eyebrow="the problem"
          title="Onchain credit is amnesiac and brutal."
        >
          <Reveal>
            <div className="stagger grid gap-5 md:grid-cols-2">
              {PROBLEMS.map((p, i) => (
                <div key={p.title} style={{ ["--n" as string]: i }}>
                  <div className="panel panel-hover h-full p-6">
                    <h3 className="text-[17px] font-medium leading-snug text-[#eef0f5]">{p.title}</h3>
                    <p className="mt-3 text-[14px] leading-relaxed text-[#8b93a5]">{p.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </Section>

        {/* ── How it works ───────────────────────────────────────────── */}
        <Section
          id="how"
          eyebrow="how it works"
          title="A real Ethereum transaction becomes onchain credit."
          lede="The Creditcoin runtime validates the proof itself. A submission either carries Merkle inclusion and continuity the precompile accepts, or it reverts - there is nothing in between for an oracle to sit in."
        >
          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
            <Reveal>
              <Frame caption="ingestion path">
                <ProofDiagram className="w-full" />
              </Frame>
            </Reveal>
            <Reveal delay={70}>
              <Frame caption="score composition">
                <ScoreDiagram className="w-full" />
              </Frame>
            </Reveal>
          </div>

          <Reveal delay={120}>
            <div className="mt-5 panel p-6">
              <p className="text-[14.5px] leading-relaxed text-[#cdd2de]">
                <span className="font-medium text-up">Ingestion is permissionless.</span>{" "}
                Anyone may submit a proof for anyone, because the proof validates itself - and
                credit accrues to the address decoded out of the proven log, never to the caller.
                Meritr&apos;s own relayer runs under a key holding{" "}
                <span className="text-[#eef0f5]">zero roles</span>, which is that claim
                demonstrated rather than asserted.
              </p>
            </div>
          </Reveal>
        </Section>

        {/* ── The guarantee ──────────────────────────────────────────── */}
        <Section
          id="guarantee"
          eyebrow="the guarantee"
          title="The AI decides whom. The chain decides how much."
          lede="This is the load-bearing decision in the protocol, and it is one function signature."
        >
          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            {/* min-w-0: a grid child defaults to min-width:auto, so without this it refuses to
                shrink below the signature's intrinsic width and the page scrolls sideways on a
                phone instead of the <pre> scrolling inside its own panel. */}
            <Reveal className="min-w-0">
              <div className="panel overflow-hidden">
                <div className="border-b border-[var(--color-line)] px-5 py-3">
                  <p className="mono text-[11px] text-[#5d6474]">MeritrVault.sol</p>
                </div>
                <pre className="mono scroll-x px-5 py-6 text-[13px] leading-relaxed text-[#cdd2de]">
{`function `}<span className="text-model">restructure</span>{`(address borrower)
    external
    returns (uint256, uint256, uint256);`}
                </pre>
                <div className="border-t border-[var(--color-line)] px-5 py-5">
                  <p className="text-[14px] leading-relaxed text-[#8b93a5]">
                    One argument. No rate, no amount, no score, no signature over off-chain
                    numbers. The vault re-reads the borrower&apos;s Attestcoin-derived score and
                    recomputes every term itself, so a fully compromised agent key can trigger
                    restructurings the protocol would already have approved - and{" "}
                    <span className="text-[#eef0f5]">nothing else</span>.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={70} className="min-w-0">
              <div className="space-y-5">
                <Frame caption="health bands">
                  <BandsDiagram className="w-full" />
                </Frame>
                <Frame caption="relief, in order of cost">
                  <LeversDiagram className="w-full" />
                </Frame>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ── Evidence ───────────────────────────────────────────────── */}
        <Section
          id="evidence"
          eyebrow="does it work?"
          title="It has already done this onchain."
          lede="Not a description. A transaction a reviewer can open."
        >
          <Reveal>
            <LiveStats />
          </Reveal>

          <Reveal delay={90}>
            <div className="mt-5 panel overflow-hidden">
              <div className="border-b border-[var(--color-line)] px-5 py-3">
                <p className="mono text-[11px] text-[#5d6474]">a real restructuring on Creditcoin</p>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:grid-cols-3">
                {[
                  ["health factor", "1.070 → 1.350", "text-up"],
                  ["debt retired", "$1,722.48", "text-model"],
                  ["collateral seized", "none", "text-up"],
                ].map(([k, v, c]) => (
                  <div key={k}>
                    <p className="eyebrow text-[9.5px]">{k}</p>
                    <p className={`mono mt-2 text-[19px] ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--color-line)] px-5 py-4">
                <a
                  href={`${EXPLORER}/tx/${RESTRUCTURE_TX}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono text-[12px] text-[#8b93a5] transition hover:text-model"
                >
                  {RESTRUCTURE_TX.slice(0, 34)}… ↗
                </a>
              </div>
            </div>
          </Reveal>
        </Section>

        {/* ── The honest part ────────────────────────────────────────── */}
        <Section
          eyebrow="the honest part"
          title="What Meritr cannot do yet."
          lede="A credit protocol that hides its assumptions is not one anyone should use. These four are load-bearing enough to belong beside the pitch rather than beneath it."
        >
          <Reveal>
            <div className="stagger grid gap-5 md:grid-cols-2">
              {LIMITS.map((c, i) => (
                <div key={c.h} style={{ ["--n" as string]: i }}>
                  <div className="panel panel-hover h-full p-6">
                    <div className="flex items-start gap-3">
                      <span className="mono mt-0.5 text-down">✕</span>
                      <div>
                        <h3 className="text-[15px] font-medium text-[#eef0f5]">{c.h}</h3>
                        <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#8b93a5]">{c.p}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </Section>

        {/* ── CTA ────────────────────────────────────────────────────── */}
        <section className="border-t border-[var(--color-line)] py-20">
          <div className="wrap-narrow text-center">
            <Reveal>
              <h2 className="text-[26px] font-semibold text-balance text-[#f2f4f8] sm:text-[34px]">
                See a stressed loan rescued in real time.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-[#8b93a5]">
                The console shows the live risk book, each borrower&apos;s cross-chain credit
                memory, and the agent&apos;s reasoning for the position it chose to act on first.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/app" className="btn-primary px-7 py-3.5 text-[14px]">
                  Launch app
                </Link>
                <a
                  href="https://github.com/mrnetwork0001/Meritr"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost px-7 py-3.5 text-[14px]"
                >
                  View source
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
