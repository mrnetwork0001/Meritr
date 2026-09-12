/**
 * Slide content for the Meritr deck.
 *
 * Separated from the renderer so the argument can be read and edited without wading through
 * layout. Every figure marked {{...}} is substituted from the live API at build time - the
 * relayer is still running, and a deck that hardcodes its own evidence goes stale the way the
 * README used to.
 */
module.exports = (S) => [
  {
    kind: "title",
    eyebrow: "BUIDL CTC 2026 · AI / RWA",
    title: "Prove the history.<br/>Keep the collateral.",
    sub: "Autonomous DeAI debt restructuring and cross-chain credit memory, on Creditcoin.",
    foot: "usemeritr.vercel.app · github.com/mrnetwork0001/Meritr · Apache 2.0",
  },
  {
    eyebrow: "the problem",
    title: "Onchain credit is amnesiac, and it is brutal.",
    cols: [
      {
        h: "Amnesiac",
        p: "A borrower with three years of flawless Aave repayments on Ethereum arrives on a new chain as a stranger. The history is real and public. No contract on the destination chain can verify it without trusting somebody to report it faithfully.",
      },
      {
        h: "Brutal",
        p: "Every major lending market answers distress with exactly one action: liquidation. A temporary drawdown ends the borrower's equity, dumps collateral into a falling market, and pays a bonus to a bot. Traditional finance restructures distressed debt every day. DeFi seizes it.",
      },
    ],
  },
  {
    eyebrow: "what meritr is",
    title: "Credit a chain can verify. Distress a borrower can survive.",
    steps: [
      ["01", "Prove", "Read a borrower's real repayment, collateral and borrow history from Ethereum through Creditcoin's Attestcoin precompile. A Merkle-inclusion and continuity proof the runtime itself validates."],
      ["02", "Score", "Fold proven facts into a portable 300–900 score that sets the interest rate and borrowing capacity, recomputed onchain rather than supplied as an argument."],
      ["03", "Restructure", "When a position enters distress, an autonomous agent cuts the rate, extends the term and retires debt from a reserve — instead of liquidating. The borrower keeps their collateral."],
    ],
  },
  {
    eyebrow: "the integration",
    title: "Attestcoin is the only way a fact can enter.",
    pipeline: [
      ["ETHEREUM MAINNET", "Aave V3 repayment, supply, borrow", "chainKey 3"],
      ["PROOF BUILDER", "Merkle inclusion + continuity proof", "Creditcoin service"],
      ["PRECOMPILE 0x…0FD2", "the Creditcoin runtime verifies it", "not an oracle"],
      ["MERITRATTESTOR", "decoded against an onchain event schema", "CreditFactAttested"],
    ],
    note: "MeritrAttestor inherits ASCBase and resolves chain keys from the ChainInfo precompile at 0x…0FD3 rather than hardcoding them — a wrong key fails silently, so the deployment script aborts on a mismatch. Remove Attestcoin and the protocol has no inputs at all.",
  },
  {
    eyebrow: "the security claim, made checkable",
    title: "Change one byte. The runtime refuses it.",
    verdicts: [
      ["GENUINE PROOF", "ACCEPTED", "up"],
      ["ONE BYTE ALTERED", "REJECTED — Merkle proof validation failed", "down"],
    ],
    note: "npm run verify:proof — a view call against the live precompile. No gas, no wallet, no account. Anyone can run it, including a judge, against the deployed contracts. Nobody can insert a credit fact: not the team, not a key, not a committee.",
  },
  {
    eyebrow: "evidence",
    title: "Real borrowers. Not a fixture.",
    stats: [
      ["{{FACTS}}", "credit facts proven"],
      ["{{BORROWERS}}", "real Ethereum borrowers"],
      ["{{VALUE}}", "of proven Aave activity"],
      ["0", "oracle operators"],
    ],
    note: "Counted from chain logs, not written down. A relayer holding no roles at all adds to this every four minutes, whether anyone is watching or not — which is a harder claim to fake than a recorded demo. Read live at /api/attestations.",
  },
  {
    eyebrow: "why it matters",
    title: "The score is not a badge. It is the terms.",
    compare: [
      { label: "NO PROVEN HISTORY", score: "300", tier: "Bronze", apr: "24.00%", ltv: "30%", tone: "down" },
      { label: "29 PROVEN AAVE FACTS", score: "785", tier: "Platinum", apr: "7.84%", ltv: "70.4%", tone: "up" },
    ],
    note: "Same protocol, same collateral, same day. The only difference is history a chain could verify. That is the product.",
  },
  {
    eyebrow: "the load-bearing decision",
    title: "restructure takes one argument: an address.",
    code: "function restructure(address borrower)\n    external\n    returns (uint256, uint256, uint256);",
    strike: ["No rate.", "No amount.", "No score.", "No signature over off-chain numbers."],
    note: "The vault re-reads the borrower's Attestcoin-derived score and recomputes every term through the same library the agent used. The AI decides whether and whom. The chain decides how much. A fully compromised agent key can trigger restructurings the protocol would already have approved, and nothing else.",
  },
  {
    eyebrow: "autonomy, demonstrated",
    title: "The agent found it, ranked it, and acted. Unattended.",
    log: [
      "Book  3 position(s): healthy=1, stressed=2",
      "Triage: 2 position(s) actionable, ranked by loss averted.",
      "  Restructuring 0x27e7c47f…: HF 1.079 -> 1.350, retiring 1321.01",
      "  Confirmed: 0xfc72b3449fd384a331bf…",
      "  Restructuring 0xc5818BFB…: HF 1.079 -> 1.350, retiring 550.42",
      "  Confirmed: 0x75bc20b274853f0e1f01…",
    ],
    note: "Both transactions signed by 0xC06B6015…, a key holding RISK_AGENT_ROLE and no other role on any Meritr contract. Health factor 1.079 → 1.350 on both. No collateral seized — this vault has never emitted a Liquidated event. Check triggeredBy on either transaction.",
  },
  {
    eyebrow: "trust model",
    title: "Assume the agent key is stolen.",
    cols2: [
      { h: "It can", tone: "warn", items: ["Trigger restructurings the protocol would already have approved"] },
      { h: "It cannot", tone: "up", items: ["Invent a score", "Grant itself a rate", "Choose an amount", "Drain the reserve", "Seize collateral"] },
    ],
    note: "The agent is not a liveness dependency either: anyone may trigger the identical restructuring six hours after a position is flagged. Borrower protection does not hinge on a server staying up. agents/scoring.py mirrors CreditMath.sol to the wei, and 168 parity vectors generated from the deployed library assert it.",
  },
  {
    eyebrow: "stated plainly",
    title: "What is real, and what is not.",
    table: [
      ["Credit facts", "proof-verified — nobody can create one without the precompile", "up"],
      ["The restructurings", "real onchain state, two of them agent-signed", "up"],
      ["Contracts", "all five source-verified on Blockscout", "up"],
      ["Collateral pricing", "governance-fed behind PRICE_ROLE — the single trusted input", "warn"],
      ["Demo market tokens", "synthetic, open mint, worth nothing — and verified, so checkable", "warn"],
      ["“ZK-Credit”", "a commitment scheme today, not a SNARK", "warn"],
      ["Contracts", "unaudited. A CertiK audit is a prize, not a completed step", "warn"],
    ],
    note: "The credit layer holds no reference to the market layer: grep -ci 'vault' on the attestor and passport returns 0. Swapping the demo market for real assets would leave every score unchanged.",
  },
  {
    eyebrow: "judging criteria",
    title: "Against the five CEIP pillars.",
    pillars: [
      ["Technical alignment", "Attestcoin is not decoration — it is the only input path. ASCBase, the 0x…0FD2 BlockProver, the 0x…0FD3 ChainInfo registry."],
      ["Market & technical relevance", "Cross-chain credit portability and restructuring-over-liquidation are live problems. The source data is real Aave V3 mainnet activity."],
      ["Product vision", "History should follow a borrower between chains; distress should be survivable. The passport makes the first portable, the vault the second real."],
      ["Execution capability", "{{COMMITS}} commits across the window, 50 Solidity and 39 Python tests, wei-level agent/contract parity, a written limitations section."],
      ["User-base expansion", "Honest status: {{BORROWERS}} proven borrowers have not opted in. A real distribution channel, but converting it is future work — not a shipped result."],
    ],
  },
  {
    eyebrow: "what comes next",
    title: "From proven history to a credit market.",
    next: [
      ["Real assets", "The vault's asset and collateral are immutable, so production means a fresh deployment against canonical stablecoins and a real price feed rather than PRICE_ROLE."],
      ["Writeability", "Creditcoin's write path is in final development. When it ships, a restructuring decided here can settle on the source chain."],
      ["The SNARK", "factsCommitment is the intended substitution point: prove a score band without publishing the facts behind it."],
      ["Onboarding the proven", "{{BORROWERS}} addresses already carry standing here. Reaching them is the go-to-market."],
    ],
  },
  {
    kind: "close",
    title: "Meritr",
    sub: "Cross-chain credit a chain can verify. Distress a borrower can survive.",
    links: [
      ["Live console", "usemeritr.vercel.app"],
      ["Source", "github.com/mrnetwork0001/Meritr"],
      ["Risk API", "meritr.38.49.216.120.sslip.io/api/attestations"],
      ["MeritrVault", "0x233D2aE279230fBFFbe61e6dF2A9DC6bF6ff3e84"],
    ],
    foot: "Creditcoin CC3 testnet, chain 102031 · Attestcoin precompile 0x…0FD2 · figures read from chain on {{DATE}}",
  },
];
