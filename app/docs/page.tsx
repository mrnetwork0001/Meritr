import type { Metadata } from "next";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { DocsNav, type DocsGroup } from "../components/DocsNav";

export const metadata: Metadata = {
  title: "Docs - Meritr",
  description:
    "How Meritr proves cross-chain credit history through Attestcoin and restructures distressed debt instead of liquidating it.",
};

const EXPLORER = "https://creditcoin-testnet.blockscout.com";
const REPO = "https://github.com/mrnetwork0001/Meritr";

const ATTESTOR = "0xB462C2772b8003e3c511C373dDC5715642B34D4c";
const VAULT = "0x233D2aE279230fBFFbe61e6dF2A9DC6bF6ff3e84";
const PASSPORT = "0xAdd2C477A101250C8A3e6Fe26a642143F610A601";

const GROUPS: DocsGroup[] = [
  {
    title: "Getting started",
    items: [
      { id: "what", label: "What Meritr is" },
      { id: "how", label: "How it works" },
      { id: "where", label: "Where everything lives" },
    ],
  },
  {
    title: "Protocol",
    items: [
      { id: "attestcoin", label: "Attestcoin integration" },
      { id: "chainkeys", label: "Chain keys" },
      { id: "scoring", label: "Credit scoring" },
      { id: "vault", label: "Vault & restructuring" },
      { id: "passport", label: "Credit passport" },
    ],
  },
  {
    title: "The agent",
    items: [
      { id: "agent", label: "What the agent decides" },
      { id: "safety", label: "Safety model" },
    ],
  },
  {
    title: "Operate",
    items: [
      { id: "run", label: "Run it yourself" },
      { id: "verify", label: "Verify the proofs" },
    ],
  },
  {
    title: "Trust",
    items: [
      { id: "provenance", label: "What is real" },
      { id: "limits", label: "Limitations" },
    ],
  },
];

/* ── small presentational helpers ───────────────────────────────────── */

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-[34px] font-semibold leading-tight text-balance text-[#f7f8fb] sm:text-[44px]">
      {children}
    </h1>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 border-t border-[var(--color-line)] pt-10 text-[23px] font-semibold text-[#f2f4f8] sm:text-[27px]"
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[15.5px] leading-relaxed text-[#8b93a5]">{children}</p>;
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="mono rounded bg-ink-800 px-1.5 py-0.5 text-[12.5px] text-[#d5d9e2]">
      {children}
    </code>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  const ext = href.startsWith("http");
  return (
    <a
      href={href}
      {...(ext ? { target: "_blank", rel: "noreferrer" } : {})}
      className="text-up underline decoration-up/30 underline-offset-2 hover:decoration-up"
    >
      {children}
    </a>
  );
}

/** Label/value rows, as in a spec sheet. */
function Rows({ rows }: { rows: Array<[React.ReactNode, React.ReactNode]> }) {
  return (
    <dl className="mt-6 divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
      {rows.map(([k, v], i) => (
        <div key={i} className="grid gap-1 py-3.5 sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-6">
          <dt className="text-[14px] text-[#8b93a5]">{k}</dt>
          <dd className="min-w-0 break-words text-[14px] text-[#d5d9e2]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-[var(--radius-panel)] border border-[var(--color-line)] border-l-2 border-l-model bg-model/5 p-4 text-[14.5px] leading-relaxed text-[#b8bfcd]">
      {children}
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="mono mt-5 overflow-x-auto rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-ink-900 p-4 text-[12.5px] leading-relaxed text-[#b8bfcd]">
      {children}
    </pre>
  );
}

/* ── page ───────────────────────────────────────────────────────────── */

export default function DocsPage() {
  return (
    <>
      <SiteHeader />

      <main id="main" className="wrap py-12 sm:py-16">
        <div className="gap-14 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="mb-12 lg:mb-0">
            <div className="lg:sticky lg:top-20">
              <DocsNav groups={GROUPS} />
            </div>
          </aside>

          <article className="min-w-0 max-w-3xl">
            <p className="eyebrow">Documentation</p>
            <div className="mt-3">
              <H1>Prove the history. Keep the collateral.</H1>
            </div>
            <P>
              <strong className="text-[#d5d9e2]">
                Meritr is an autonomous credit protocol on Creditcoin.
              </strong>{" "}
              It reads a borrower&apos;s real repayment history from another chain through
              Attestcoin, scores it into portable credit, and when a position falls into distress
              it restructures the debt instead of liquidating it. The borrower keeps every unit of
              their collateral.
            </P>
            <P>
              Every credit fact in the system arrived as a proof the Creditcoin runtime itself
              validated. There is no oracle operator, no multisig relayer and no trusted price
              poster anywhere in that path - not as a design goal, but as a property you can test
              in one command.
            </P>

            {/* ── What ─────────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="what">What Meritr is</H2>
            </div>
            <P>Onchain credit is amnesiac and brutal, and Meritr answers both halves.</P>
            <P>
              <strong className="text-[#d5d9e2]">Amnesiac:</strong> a borrower with three years of
              flawless Aave repayments on Ethereum arrives on a new chain as a stranger. Their
              history is real and public, but no contract on the destination chain can verify it
              without trusting somebody to report it faithfully.
            </P>
            <P>
              <strong className="text-[#d5d9e2]">Brutal:</strong> every major lending market
              answers distress with exactly one action - liquidation. A temporary drawdown ends
              the borrower&apos;s equity, dumps collateral into a falling market and pays a bonus
              to a bot. Traditional finance restructures distressed debt every day. DeFi seizes
              it.
            </P>

            {/* ── How ──────────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="how">How it works</H2>
            </div>
            <Pre>{`Ethereum mainnet                 Creditcoin testnet (102031)
────────────────                 ───────────────────────────────
Aave V3 repayment    ──proof──▶  Attestcoin precompile 0x…0FD2
Aave V3 supply                          │  verifies inclusion
Aave V3 liquidation                     ▼  and continuity
                                 MeritrAttestor ──▶ credit memory
                                        │
                                        ▼
                                 MeritrVault ◀── agent triggers
                                        │        restructuring
                                        ▼
                                 MeritrPassport (soulbound)`}</Pre>
            <P>
              A relayer watches Aave V3 on Ethereum, asks Creditcoin&apos;s proof-builder for a
              proof of each relevant transaction, and submits it to <Mono>MeritrAttestor</Mono>.
              The contract hands the proof to the precompile, and only what the precompile accepts
              becomes a credit fact.
            </P>

            {/* ── Where ────────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="where">Where everything lives</H2>
            </div>
            <Rows
              rows={[
                ["Network", <>Creditcoin CC3 testnet, chain id <Mono>102031</Mono></>],
                [
                  <strong className="text-[#d5d9e2]">MeritrAttestor</strong>,
                  <A href={`${EXPLORER}/address/${ATTESTOR}`}><Mono>{ATTESTOR}</Mono></A>,
                ],
                [
                  <strong className="text-[#d5d9e2]">MeritrVault</strong>,
                  <A href={`${EXPLORER}/address/${VAULT}`}><Mono>{VAULT}</Mono></A>,
                ],
                [
                  <strong className="text-[#d5d9e2]">MeritrPassport</strong>,
                  <A href={`${EXPLORER}/address/${PASSPORT}`}><Mono>{PASSPORT}</Mono></A>,
                ],
                ["BlockProver precompile", <Mono>0x0000000000000000000000000000000000000FD2</Mono>],
                ["ChainInfo precompile", <Mono>0x0000000000000000000000000000000000000FD3</Mono>],
                [
                  "Proof-builder",
                  <Mono>https://proof-gen-api.cc3-testnet.creditcoin.network</Mono>,
                ],
                ["Source chain", <>Ethereum mainnet, Aave V3 - <Mono>chainKey 3</Mono></>],
                ["Live console", <A href="/app">/app</A>],
                ["Source", <A href={REPO}>mrnetwork0001/Meritr</A>],
                ["Creditcoin docs", <A href="https://docs.creditcoin.org">docs.creditcoin.org</A>],
              ]}
            />

            {/* ── Attestcoin ───────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="attestcoin">Attestcoin integration</H2>
            </div>
            <P>
              Attestcoin is Creditcoin&apos;s decentralised oracle: attesters watch a source
              chain, reach quorum, and submit attestations to an attestation chain. A smart
              contract can then hand a proof to the BlockProver precompile and trust the fields it
              decodes. Creditcoin calls this half of the protocol{" "}
              <strong className="text-[#d5d9e2]">readability</strong>, and it is what Meritr uses.
            </P>
            <Callout>
              <strong className="text-model">Readability is live; writeability is not.</strong>{" "}
              The Creditcoin team confirmed in the season kickoff AMA that readability is
              available on testnet and mainnet today, while writeability - acting on a foreign
              chain through the protocol - is in its final phase of development and out of scope
              for this season. Meritr claims readability only. Reads carry no protocol fee; ATC
              covers staking, slashing, rewards and future writeability fees, while CTC pays gas.
            </Callout>
            <P>
              <Mono>MeritrAttestor</Mono> inherits <Mono>ASCBase</Mono> from{" "}
              <Mono>@gluwa/asc-contracts</Mono>. Ingestion sets the active chain key, then
              self-calls <Mono>execute</Mono> so that a direct call to the inherited entry point
              reverts with <Mono>DirectExecuteForbidden</Mono> - the contract will not process a
              payload that did not come through its own front door.
            </P>
            <P>
              Which logs count is not hardcoded. An onchain schema registry keyed by{" "}
              <Mono>(chainKey, emitter, topic0)</Mono> decides whether a log is a repayment,
              a collateral supply, a borrow or a liquidation, so a new market can be registered
              without redeploying the contract.
            </P>

            {/* ── Chain keys ───────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="chainkeys">Chain keys</H2>
            </div>
            <P>
              A <Mono>chainKey</Mono> is not an EVM chain id, and its value differs per Creditcoin
              network. This is the single easiest way to get an Attestcoin integration silently
              wrong: a mismatched key fails no assertion, it simply means no proof ever matches a
              schema and the credit history stays empty forever.
            </P>
            <Rows
              rows={[
                ["Ethereum mainnet, on Creditcoin testnet", <Mono>chainKey 3</Mono>],
                ["Sepolia, on Creditcoin testnet", <Mono>chainKey 1</Mono>],
                ["Ethereum mainnet, on Creditcoin mainnet", <Mono>chainKey 1</Mono>],
                ["Base, Solana, anything else", "not registered - Attestcoin cannot prove it"],
              ]}
            />
            <P>
              Meritr does not trust its own table. <Mono>scripts/verifyChainKeys.js</Mono> reads
              the ChainInfo precompile at <Mono>0x…0FD3</Mono> and compares it against the
              catalogue, and deployment aborts on a mismatch.
            </P>

            {/* ── Scoring ──────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="scoring">Credit scoring</H2>
            </div>
            <P>
              Proven facts fold into a 300-900 score through <Mono>CreditMath.sol</Mono>, across
              five weighted components: repayment volume, repayment count, collateral history,
              wallet maturity and liquidation penalty. The weights sum to basis-point precision so
              no component can silently dominate.
            </P>
            <P>
              The score sets the borrower&apos;s interest rate band and borrowing capacity. It is
              recomputed onchain from attested facts, never supplied as an argument.
            </P>

            {/* ── Vault ────────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="vault">Vault &amp; restructuring</H2>
            </div>
            <P>The load-bearing design decision in the entire protocol is this signature:</P>
            <Pre>{`function restructure(address borrower)
    external
    returns (uint256, uint256, uint256);`}</Pre>
            <P>
              No rate. No amount. No score. No signature over off-chain numbers. The vault re-reads
              the score from <Mono>MeritrAttestor</Mono> - whose every input carries an Attestcoin
              proof - and recomputes each term through the same library the agent used.{" "}
              <strong className="text-[#d5d9e2]">
                The agent decides whether and whom. The chain decides how much.
              </strong>
            </P>
            <P>
              Restructuring cuts the rate, extends the term and retires debt from a protocol
              reserve toward a health factor of 1.35 - drawing at most 25% of the reserve in one
              event, and nothing at all when the reserve is empty, in which case it degrades to
              rate relief and a term extension. It has no code path that moves collateral at
              all; seizure exists only in the separate liquidation backstop, which activates below
              a health factor of 1.
            </P>

            {/* ── Passport ─────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="passport">Credit passport</H2>
            </div>
            <P>
              <Mono>MeritrPassport</Mono> is a soulbound ERC-721: transfers revert in the{" "}
              <Mono>_update</Mono> hook, and <Mono>approve</Mono> and{" "}
              <Mono>setApprovalForAll</Mono> revert outright. Artwork is generated fully onchain as
              SVG, so the token depends on no external host.
            </P>
            <Callout>
              <strong className="text-model">On the name.</strong> &quot;ZK-Credit&quot; describes
              a commitment scheme today, not a SNARK. The passport commits to a score without
              republishing the underlying facts; it does not yet prove statements about that score
              in zero knowledge. Said plainly here rather than implied by the branding.
            </Callout>

            {/* ── Agent ────────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="agent">What the agent decides</H2>
            </div>
            <P>
              The DeAI risk agent watches every open position, ranks them by expected loss
              averted, and triggers restructuring on the position where intervention is worth the
              most. That ranking is the entire scope of its discretion.
            </P>
            <P>
              Its arithmetic is checked against the chain&apos;s. <Mono>agents/scoring.py</Mono>{" "}
              mirrors <Mono>CreditMath.sol</Mono> exactly, including integer truncation, and a
              parity suite runs vectors generated from the deployed library asserting every
              component of every score matches. A one-wei divergence fails the build.
            </P>

            {/* ── Safety ───────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="safety">Safety model</H2>
            </div>
            <Rows
              rows={[
                [
                  "A compromised agent key can",
                  "trigger restructurings the protocol would already have approved",
                ],
                [
                  "It cannot",
                  "invent a score, grant itself a rate, choose an amount, or drain the reserve",
                ],
                [
                  "If the agent goes offline",
                  "anyone may trigger the identical restructuring after a 6-hour grace period",
                ],
                ["Per-loan limits", "a cooldown between interventions and a hard cap on their number"],
                ["Deployer key", "never placed on the server that runs the agent"],
              ]}
            />
            <P>
              Borrower protection does not hinge on a server staying up, and the agent is not a
              liveness dependency for the protocol.
            </P>

            {/* ── Run ──────────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="run">Run it yourself</H2>
            </div>
            <Pre>{`git clone https://github.com/mrnetwork0001/Meritr
cd Meritr && npm install
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

npx hardhat test        # 50 Solidity tests
.venv/bin/pytest -q     # 39 Python tests, incl. score parity

npm run backend         # risk API
npm run dev             # console`}</Pre>

            {/* ── Verify ───────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="verify">Verify the proofs</H2>
            </div>
            <P>
              The claim that no key can insert a credit fact is worth exactly what the
              precompile&apos;s refusal is worth, so you can make it refuse on demand. This fetches
              a real Aave repayment proof, asks the live precompile to judge it, flips a single
              byte inside the proven transaction, and asks again:
            </P>
            <Pre>{`npm run verify:proof

genuine proof      -> ACCEPTED
one byte altered   -> REJECTED (Merkle proof validation failed)`}</Pre>
            <P>
              <Mono>verify</Mono> is a view function, so this costs no gas and needs no funded
              account. Every fact in <Mono>MeritrAttestor</Mono> cleared that same gate.
            </P>

            {/* ── Provenance ───────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="provenance">What is real</H2>
            </div>
            <P>
              Creditcoin testnet has no canonical stablecoin, so the lending market trades a demo
              pair Meritr deployed itself. Both tokens have an open mint and are worth nothing.
              That is disclosed rather than papered over - and it does not reach the credit data.
            </P>
            <Rows
              rows={[
                ["Credit facts", "proof-verified - nobody can create one without the precompile"],
                ["Borrowed asset (mUSD)", "synthetic, ungated mint, price pinned at $1.00"],
                ["Collateral (mWETH)", "synthetic unit, marked with a live Chainlink ETH/USD feed"],
              ]}
            />
            <P>The separation is checkable in one command:</P>
            <Pre>{`grep -ci 'vault' contracts/MeritrAttestor.sol contracts/MeritrPassport.sol
# → 0`}</Pre>
            <P>
              The credit layer holds no reference to the market layer. Swapping the demo market
              for real assets would leave every score unchanged.
            </P>

            {/* ── Limits ───────────────────────────────────────────── */}
            <div className="mt-12">
              <H2 id="limits">Limitations</H2>
            </div>
            <P>Stated because a credit protocol that hides its assumptions is not one anyone should use.</P>
            <Rows
              rows={[
                [
                  "Collateral pricing is governance-fed",
                  "the single trusted input in the risk path; production needs a real feed",
                ],
                [
                  "Source timestamps are approximated",
                  "the prover exposes a verified height, not a verified timestamp",
                ],
                ["The contracts are unaudited", "treat any mainnet deployment accordingly"],
                [
                  "The demo market tokens are freely mintable",
                  "and immutable in the vault, so swapping them needs a new deployment",
                ],
                ["“ZK-Credit” is a commitment scheme", "not a SNARK, today"],
              ]}
            />
          </article>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
