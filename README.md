# Meritr

**Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS on Creditcoin**

Built for the [BUIDL CTC 2026 Fall Hackathon](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail) · Creditcoin & Credit Labs · Track: `AI` / `RWA` · Apache 2.0

### Try it without installing anything

| | |
|---|---|
| **Console** | **https://usemeritr.vercel.app** |
| Documentation | https://usemeritr.vercel.app/docs |
| Risk API | https://meritr.38.49.216.120.sslip.io/api/attestations |
| Swagger | https://meritr.38.49.216.120.sslip.io/api/docs |

The console is static and served from Vercel's CDN. Everything it displays comes from the API
origin above, which is a VPS running the parts of Meritr that cannot be serverless - because
**the interesting half of this project is the half that never stops running**:

```
meritr-relayer   proves fresh Aave V3 activity into MeritrAttestor   every 240s
meritr-agent     re-reads every position and triages the worst       every 300s
meritr-api       serves chain state; holds no key and no role          -
meritr-web       the console                                           -
```

Both daemons run under systemd on a box that also hosts unrelated applications, so they are
confined to loopback ports, a dedicated service account and their own directory. The deployer
key is not on that machine and never has been: the relayer key holds **no roles at all**, and
the agent key holds `RISK_AGENT_ROLE` and nothing else. `deploy/SETUP.md` is the whole recipe,
and `deploy/push.sh` refuses to sync to any path that is not Meritr's.

That matters more than a URL. "Autonomous" is cheap to claim in a demo video; it is harder to
claim against a public ledger that keeps gaining entries while nobody is watching. The fact
count below moves on its own - reload it.

**Live on Creditcoin CC3 Testnet (chain 102031).** Credit history is read from Aave V3 on **Ethereum mainnet** via Attestcoin `chainKey 3`.

**Every contract is source-verified on Blockscout.** The links below open the source, not the
bytecode - the whole protocol is readable without cloning anything, and the code on chain is
provably the code in this repository.

| Contract | Address | |
|---|---|---|
| MeritrAttestor | [`0xB462C2772b8003e3c511C373dDC5715642B34D4c`](https://creditcoin-testnet.blockscout.com/address/0xB462C2772b8003e3c511C373dDC5715642B34D4c#code) | verified |
| MeritrVault | [`0x233D2aE279230fBFFbe61e6dF2A9DC6bF6ff3e84`](https://creditcoin-testnet.blockscout.com/address/0x233D2aE279230fBFFbe61e6dF2A9DC6bF6ff3e84#code) | verified |
| MeritrPassport | [`0xAdd2C477A101250C8A3e6Fe26a642143F610A601`](https://creditcoin-testnet.blockscout.com/address/0xAdd2C477A101250C8A3e6Fe26a642143F610A601#code) | verified |
| mUSD (demo asset) | [`0xd3291cF85D4f9CD4f2dF77Fcbc4E89B806A39981`](https://creditcoin-testnet.blockscout.com/address/0xd3291cF85D4f9CD4f2dF77Fcbc4E89B806A39981#code) | verified |
| mWETH (demo collateral) | [`0x53653C7005c0b3406d42Af27570F63D28C4EB7f7`](https://creditcoin-testnet.blockscout.com/address/0x53653C7005c0b3406d42Af27570F63D28C4EB7f7#code) | verified |

Solidity 0.8.28, optimizer on, viaIR. The demo tokens are verified too, so the open `mint()`
disclosed further down is checkable rather than merely admitted.

**210+ real Attestcoin proofs are ingested and still climbing** - a roleless relayer daemon
continuously proves fresh Ethereum Aave activity into this deployment. At the time of writing
that is **100 real Ethereum borrowers** carrying onchain credit from **$23.1M** of proven Aave
activity, roughly a third of it repayment, the rest collateral and borrow events, each one a distinct
input to the score. The live count is served at `/api/attestations` and rendered on the landing
page, because any figure written here goes stale within the hour.

**The agent has restructured distressed positions unattended.** Two of the four recorded
restructurings were broadcast by the DeAI agent itself
([tx](https://creditcoin-testnet.blockscout.com/tx/0xfc72b3449fd384a331bf6e689bf8eca13abeedd2e9d224919bca8f5f8a8a0858)),
from `0xC06B6015…` - a key holding `RISK_AGENT_ROLE` and nothing else. It found the distress on
its own polling cycle, ranked two equally stressed positions by expected loss averted, and took
the larger one first. Health factor 1.079 → 1.350 on both, **no collateral seized**. The vault
has never emitted a `Liquidated` event. The earlier two were broadcast by the deployer during
the first walkthrough; `triggeredBy` tells them apart.

**Contents** -
[The problem](#the-problem) ·
[What Meritr does](#what-meritr-does) ·
[Attestcoin integration](#the-load-bearing-design-decision) ·
[Subsystems](#the-four-subsystems) ·
[Documentation](#documentation) ·
[Quickstart](#quickstart) ·
[Tests](#tests) ·
[What is real and what is not](#asset-provenance---what-is-real-and-what-is-not) ·
[Honest limitations](#honest-limitations) ·
[Judging criteria](#how-this-maps-to-the-judging-criteria)

---

## Verify this in 60 seconds, without cloning anything

Every claim below is checkable by a third party against public infrastructure. Nothing here
depends on trusting this repository.

| Claim | How to check it yourself |
|---|---|
| Attestcoin really verified these proofs | Open [MeritrAttestor on Blockscout](https://creditcoin-testnet.blockscout.com/address/0xB462C2772b8003e3c511C373dDC5715642B34D4c) and read the `CreditFactAttested` logs. Each one exists only because the `0x…0FD2` precompile accepted a Merkle-inclusion proof; the contract has no path that writes a fact without one. |
| The deployed code is the code in this repo | Every contract is source-verified on Blockscout. Open any address above and read `#code` - including the demo tokens, so the open mint is inspectable rather than taken on trust. |
| The **agent itself** restructured, unattended | [Restructuring tx](https://creditcoin-testnet.blockscout.com/tx/0xfc72b3449fd384a331bf6e689bf8eca13abeedd2e9d224919bca8f5f8a8a0858) - `triggeredBy` is `0xC06B6015…`, which holds `RISK_AGENT_ROLE` and no other role. Health factor 1.079 → 1.350. |
| Nothing was seized doing it | The vault has never emitted a `Liquidated` event. Check the logs on [MeritrVault](https://creditcoin-testnet.blockscout.com/address/0x233D2aE279230fBFFbe61e6dF2A9DC6bF6ff3e84). |
| The source data is real Ethereum activity | Take any `queryId` from a `CreditFactAttested` log and find the same Aave V3 event on [Etherscan](https://etherscan.io). The borrower, asset and amount match because they were proven, not copied. |
| The numbers on the site are live, not written down | `curl https://meritr.38.49.216.120.sslip.io/api/attestations` - it counts from chain logs on every request, so it moves while you watch it. |
| The agent is genuinely running, not demoed once | The fact count above climbs on its own, because a relayer daemon adds to it every 240 seconds whether or not anyone is looking. |
| The precompile rejects bad proofs | `npm run verify:proof` fetches a genuine Aave proof, asks the live precompile to judge it, then flips one byte and asks again. Output: `genuine proof -> ACCEPTED` / `one byte altered -> REJECTED (Merkle proof validation failed)`. It is a view call, so it costs no gas. |

---

## The problem

Onchain credit is amnesiac and brutal.

**Amnesiac:** a borrower with three years of flawless Aave repayments on Ethereum arrives on a new chain as a stranger. Their history is real, it is public, and it is unusable - because no contract on the destination chain can verify it without trusting an oracle operator to report it faithfully.

**Brutal:** every major lending market answers borrower distress with exactly one action - liquidation. A temporary 30% collateral drawdown destroys the borrower's equity, dumps collateral into a falling market, pays a bonus to a bot, and permanently ends a paying customer relationship. Traditional finance restructures distressed debt every day. DeFi seizes it.

## What Meritr does

Meritr makes cross-chain credit history **provable** and makes distress **survivable**.

1. It ingests a borrower's real repayment, collateral and liquidation history from Ethereum through Creditcoin's **Attestcoin native query verifier precompile at `0x0000000000000000000000000000000000000FD2`** - a Merkle-inclusion and continuity proof the Creditcoin runtime itself validates. No oracle operator, no multisig relayer, no trusted price poster sits anywhere in that path.
2. It scores that proven history into a portable **ZK-Credit score** that sets a borrower's interest rate and borrowing capacity.
3. When a position enters distress, an autonomous **DeAI risk agent restructures it instead of liquidating** - cutting the rate, extending the term, and retiring debt from a protocol reserve toward a healthy position - bounded at 25% of the reserve per event, and degrading to rate relief plus a term extension when the reserve is empty. The borrower keeps every unit of their collateral.

```
Ethereum mainnet              Creditcoin EVM testnet (102031)
─────────────────              ────────────────────────────────────────────
Aave V3 repayments  ──proof──▶  Attestcoin precompile 0xFD2
Aave V3 supplies                        │  verifies inclusion + continuity
Aave V3 liquidations                    ▼
                                MeritrAttestor  ──▶ cross-chain credit memory
                                        │
                                        ▼
                                MeritrVault  ◀── DeAI agent triggers restructuring
                                        │        (agent chooses *whom*; the chain
                                        ▼         recomputes *how much*)
                                MeritrPassport (soulbound)
```

---

## The load-bearing design decision

**`restructure` takes one argument: an address.**

```solidity
function restructure(address borrower) external returns (uint256, uint256, uint256);
```

No rate. No amount. No score. No signature over off-chain numbers.

The vault re-reads the borrower's score from `MeritrAttestor` - whose every input carries an Attestcoin proof - and recomputes each term through the same `CreditMath` library the off-chain agent used. The AI decides **whether and whom** to help. The chain decides **how much**.

This is what makes an autonomous agent safe to point at user debt. A fully compromised agent key can trigger restructurings the protocol would already have approved, and nothing else. It cannot invent a score, grant itself a rate, or drain the reserve.

Two properties make that claim real rather than rhetorical:

- **The agent's math is verified against the chain's.** `agents/scoring.py` mirrors `CreditMath.sol` exactly, including integer truncation. [`tests/test_parity.py`](tests/test_parity.py) runs 168 vectors generated from the *deployed* library and asserts every component of every score matches. A one-wei divergence fails the build.
- **The agent is not a liveness dependency.** If it goes offline while a position is stressed, anyone may trigger the identical restructuring after a 6-hour grace period. Borrower protection does not hinge on a server staying up.

---

## The four subsystems

### 1. Attestcoin ingestion - [`contracts/MeritrAttestor.sol`](contracts/MeritrAttestor.sol)

Inherits Creditcoin's canonical `ASCBase` from [`@gluwa/asc-contracts`](https://www.npmjs.com/package/@gluwa/asc-contracts), which calls the `0xFD2` precompile and deduplicates by query id.

Ingestion is **permissionless** - the proof is self-validating, so anyone may submit history for anyone. Credit accrues to the address decoded *out of the proven log*, never to the submitter. Relayers can backfill a borrower's history without being able to forge it.

Rather than hard-coding Aave's ABI, Meritr keeps an onchain **event schema registry**: `(chainKey, emitter, topic0) → {action, subjectTopic, amountWord, …}`. Supporting Compound, Morpho or a new Aave market is a registry write, not a redeploy. An unregistered emitter is ignored, so a proof of a log from an attacker's own contract contributes nothing.

**Chain keys are the easiest thing to get wrong.** `chainKey` is not the EVM chain id, and its
value differs per Creditcoin network: on **testnet** Ethereum is `chainKey 3` and Sepolia is
`chainKey 1`; on **mainnet** Ethereum is `chainKey 1`. Nothing else is registered - Attestcoin
cannot prove Base or Solana at all. A wrong key fails silently, because proofs simply never
match a schema and the credit history stays empty forever, so Meritr does not trust its own
table: [`scripts/verifyChainKeys.js`](scripts/verifyChainKeys.js) reads the ChainInfo precompile
at `0x…0FD3` and `deploy.js` aborts on a mismatch.

### 2. DeAI risk agent - [`agents/`](agents/)

- [`scoring.py`](agents/scoring.py) - the verified mirror of onchain `CreditMath`.
- [`risk.py`](agents/risk.py) - classification, buffer-to-liquidation, time-to-liquidation, expected-loss-averted, and **triage**. The reserve is finite, so when three positions are stressed the order the agent works the queue in changes the outcome. It ranks by loss averted, not arrival.
- [`underwriter.py`](agents/underwriter.py) - the loop. Discovers every borrower from the vault's own `LoanOpened` logs (no external index - a restarted agent rebuilds its whole working set from the chain), assesses, triages, simulates, then broadcasts.

Every decision carries a human-readable rationale, surfaced in the API and dashboard.

### 3. Auto-refinancing vault - [`contracts/MeritrVault.sol`](contracts/MeritrVault.sol)

Between *healthy* and *liquidatable* Meritr inserts a **stress band** (health factor 1.00–1.15). Inside it, three levers are applied in increasing order of cost:

| Lever | Effect | Cost to lenders |
|---|---|---|
| Rate relief | reprice to the borrower's earned rate, capped at 6pp of relief, floored at the protocol's best rate | none |
| Term extension | +30 days per event | none |
| Micro-refinance | retire debt from the reserve until health factor reaches 1.35 | none - **reserve-funded** |

**Relief is funded, not conjured.** The reserve accrues from 15% of realised interest. Lender principal is never touched; `totalAssets()` deliberately excludes the reserve so a lender cannot withdraw the capital earmarked to keep borrowers solvent. When the reserve is empty, restructuring degrades gracefully to rate relief and term extension.

Guardrails: max 3 restructurings per loan, 12-hour cooldown, 25% cap on reserve drawdown per event. An **already-underwater** position is explicitly *not* restructurable - absorbing it would socialise real bad debt into the reserve, so liquidation remains the correct path there.

### 4. Soulbound credit passport - [`contracts/MeritrPassport.sol`](contracts/MeritrPassport.sol)

A non-transferable ERC-721 carrying the borrower's credit memory.

Soulbinding is the mechanism, not the branding: a transferable credit NFT is a credit score with a market price, and anyone could farm a pristine score on a clean wallet and sell it to a defaulter. Enforcement sits at OpenZeppelin v5's `_update` hook - the single chokepoint every ERC-721 movement passes through - so mint and burn work while `transferFrom`, `safeTransferFrom`, and all operator paths revert. Approvals revert outright, so no marketplace can list a score that could never settle.

Metadata is **fully onchain** (SVG + JSON, base64). A credit record whose art disappears when a hackathon's IPFS pin lapses is not a credit record.

The passport publishes a coarse tier plus `factsCommitment`, a keccak256 binding of the exact attested inputs. A holder can disclose their facts off-chain and a counterparty can verify the commitment matches what the chain scored - selective disclosure without publishing their whole financial position.

> **Scope note, stated plainly:** this is a hash commitment, not a zero-knowledge proof. It hides the values but proves nothing about them on its own. It is the intended substitution point for a SNARK range proof, which is future work and is not claimed as implemented.

---

## Documentation

The hackathon asks for working Attestcoin integration code **and** technical documentation
explaining how the build uses it. Both are in this repository.

| Document | What it covers |
| --- | --- |
| [docs/ATTESTCOIN_INTEGRATION.md](docs/ATTESTCOIN_INTEGRATION.md) | How Meritr uses Attestcoin readability end to end: the `ASCBase` inheritance, the `0x…0FD2` BlockProver precompile call, the `0x…0FD3` ChainInfo chain-key verification, the onchain event-schema registry, and the proof-builder REST flow. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The four subsystems, the trust boundaries between them, and why the credit layer holds no reference to the market layer. |
| [deploy/SETUP.md](deploy/SETUP.md) | Reproducing the deployment, including which key may never leave the operator's machine and why. |
| [LICENSE](LICENSE) | Apache 2.0. |

Attestations ingested by this deployment can be inspected independently of anything in this
repository, on the Creditcoin Attestcoin dashboard and on Blockscout - the deployed
`MeritrAttestor` address is in the table at the top of this file.

## Quickstart

### Deploy to Creditcoin Mainnet (one command)

```bash
npm install
cp .env.example .env          # add PRIVATE_KEY and fund it with CTC

MERITR_CONFIRM_MAINNET=yes \
MERITR_ASSET=0x…  MERITR_COLLATERAL=0x… \
npx hardhat run scripts/deploy.js --network creditcoinMainnet
```

Deploys all four subsystems, wires roles, registers Aave V3 schemas for **Ethereum mainnet and Sepolia**, and writes `deployments/creditcoinMainnet.json` - the single address book the agent, API and frontend all read.

Two deliberate gates stand in front of mainnet, because a lending protocol that custodies real deposits should never deploy on the strength of a default:

| Gate | Why |
|---|---|
| `MERITR_CONFIRM_MAINNET=yes` | The contracts are **not audited**. Deploying them must be an explicit act. |
| `MERITR_ASSET` / `MERITR_COLLATERAL` required | `MockERC20` has an open `mint`. Shipping it to mainnet would create a token anyone can print. Override with `MERITR_ALLOW_MOCK_TOKENS=yes` only if you genuinely want demo tokens. |

Testnet needs neither gate:

```bash
npx hardhat run scripts/deploy.js --network creditcoinTestnet   # chain 102031
```

### Run the whole stack locally

```bash
npm install && pip install -r requirements.txt

npx hardhat node                                          # terminal 1
npx hardhat run scripts/deploy.js   --network localhost   # terminal 2
npx hardhat run scripts/seedLocal.js --network localhost  # 3 borrowers, one stressed

MERITR_NETWORK=localhost \
RISK_AGENT_PRIVATE_KEY=0x… npm run backend                # terminal 3 - API on :8000
npm run dev                                               # terminal 4 - dashboard on :3000

MERITR_NETWORK=localhost \
RISK_AGENT_PRIVATE_KEY=0x… python3 -m agents.underwriter --once
```

### See the whole thesis in one command

```bash
npx hardhat run scripts/simulate.js
```

Six acts, every number read back from chain state:

```
ACT I    anonymous wallet   score 300 · 24.00% APR · 30% max LTV
ACT II   17 Attestcoin proofs ingested from Ethereum and Sepolia
         score 300 → 765 · APR 24.00% → 8.50% · LTV 30% → 68.75%
ACT III  soulbound passport minted; transfer attempt reverts
ACT IV   loan opened at the earned rate
ACT V    collateral −34.5%, health factor 1.070 → stress band
ACT VI   agent restructures: rate 8.50% → 7.37%, +30 days,
         $3,143.71 debt retired from reserve, HF 1.070 → 1.350,
         10.0 mWETH collateral held - none seized
```

### Health check

```bash
python3 main.py     # verifies toolchain, contracts, deployment, RPC, precompile
```

---

## Tests

```bash
npx hardhat test    # 50 passing - contracts
pytest              # 39 passing - agent, risk engine, cross-language parity
```

**Contracts (50).** Real proof ingestion through `ASCBase` + `EvmV1Decoder` using prover-format `txBytes`; rejection of unverified proofs; query-id replay protection; unregistered-emitter rejection; reverted-source-tx rejection; multi-chain diversity scoring; soulbound enforcement across every transfer path; restructuring mechanics, cooldowns, caps and the agent-offline fallback; the invariant that the vault's asset balance always equals the buckets it tracks.

**Python (39).** 168-vector cross-language parity against the deployed `CreditMath`; monotonicity of the APR and LTV curves; risk-band boundaries at exact wei; the refusal to restructure underwater positions; triage ordering under a binding reserve.

---

## Repository layout

```
contracts/
  MeritrAttestor.sol      Attestcoin ingestion - inherits ASCBase, schema registry
  MeritrVault.sol         lending + autonomous restructuring
  MeritrPassport.sol      soulbound ERC-721, onchain SVG
  libraries/CreditMath.sol  scoring, pricing curves, health math (shared with the agent)
  mocks/                  MockNativeQueryVerifier (0xFD2 stand-in), MockERC20, harness
agents/
  scoring.py  risk.py  underwriter.py  chain.py  config.py
backend/main.py           FastAPI risk API - no database, derives everything from chain
app/                      Next.js 14 dashboard
scripts/
  deploy.js               one-command deployment
  simulate.js             six-act end-to-end walkthrough
  seedLocal.js            three-borrower local scenario
  sourceSchemas.js        Aave V3 event schema catalogue
  generateParityVectors.js
test/                     Hardhat suite
tests/                    pytest suite
```

---

## Asset provenance - what is real and what is not

Run it yourself: `npx hardhat run scripts/assetProvenance.js --network creditcoinTestnet`

| Input | Address | Who can create units | Price source | Verdict |
|---|---|---|---|---|
| Borrowed asset (mUSD, 6dp) | `0xd3291cF8…` | **anyone** - `mint()` is ungated | pinned $1.00 by `PRICE_ROLE` | **synthetic** |
| Collateral (mWETH, 18dp) | `0x53653C70…` | **anyone** - `mint()` is ungated | **live Chainlink ETH/USD** | synthetic unit, **real mark** |
| Credit facts | `MeritrAttestor` | **nobody** - every fact needs a Merkle inclusion + continuity proof the `0x…0FD2` precompile accepts | n/a | **proof-verified** |

Creditcoin testnet has no canonical stablecoin, so the vault trades a demo pair Meritr deployed
itself. Both have an open mint and are worth nothing.

**That does not reach the credit data, and the separation is checkable in one command:**

```bash
grep -ci 'vault' contracts/MeritrAttestor.sol contracts/MeritrPassport.sol   # → 0
```

The credit layer holds no reference to the market layer. Scores derive from proven source-chain
facts alone - the demo tokens cannot influence them, and swapping the market for real assets
would leave every score unchanged.

## Honest limitations

Stated because a credit protocol that hides its assumptions is not one anyone should use.

- **Collateral pricing is governance-fed.** `setPrices` behind `PRICE_ROLE` is the single trusted input in the risk path; every other term derives from proof-verified data. Production needs a real price feed.
- **Source-block timestamps are approximated.** The prover exposes a verified *height*, not a verified timestamp, so wallet maturity is derived from `genesis + height × blockTime`, clamped to `block.timestamp` so no height can manufacture future history.
- **The market's demo tokens are freely mintable.** See the provenance table above. The vault's
  `ASSET` and `COLLATERAL` are `immutable`, so swapping them needs a new vault - which would
  reset the live positions and restructuring history. Disclosed rather than papered over.
- **The contracts are unaudited.** A CertiK audit is a hackathon prize, not a completed step. Treat any mainnet deployment accordingly.
- **Non-stable reserve assets need a price feed** before being registered; the current catalogue prices stablecoin reserves at $1.00.
- **"ZK-Credit" is a commitment scheme today, not a SNARK.** See the passport section above.

---

## License

Apache 2.0 - see [LICENSE](LICENSE).

**Author:** Ifeanyichukwu Emmanuel Onwo (`mrnetwork`)
