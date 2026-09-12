# Meritr - Attestcoin Protocol Integration Summary

**Submission field:** *"Attestcoin Protocol Integration Summary - explain how your project uses the Attestcoin Protocol."*

**Project:** Meritr · **Sector:** AI · **Network:** Creditcoin CC3 Testnet (102031)
**Repository:** https://github.com/mrnetwork0001/Meritr

---

## In one paragraph

Meritr reads a borrower's **real lending history on Ethereum mainnet** - Aave V3 repayments, collateral supplies and liquidations - proves each one to Creditcoin through the **Attestcoin BlockProver precompile at `0x…0FD2`**, and turns that proven history into a portable credit score that sets the borrower's interest rate and borrowing capacity on Creditcoin. When a loan later falls into distress, an autonomous agent restructures it instead of liquidating it. Attestcoin is not a feature bolted onto Meritr; it is the **only** way any credit fact enters the system. Remove it and Meritr has nothing to score.

---

## Why this needs Attestcoin specifically

Onchain credit is amnesiac. A borrower with three years of flawless Aave repayments on Ethereum arrives on another chain as a stranger - their history is real and public, but unusable, because no contract on the destination chain can verify it without trusting an oracle operator to report it honestly.

That is exactly the problem Attestcoin removes. Meritr's ingestion path contains **no oracle operator, no multisig relayer and no trusted reporter**. A submission either carries a Merkle-inclusion and continuity proof that the Creditcoin runtime itself validates, or it reverts.

The consequence is concrete: because verification is trustless, **ingestion is permissionless**. Anyone may submit a proof for anyone. Credit accrues to the address decoded out of the proven log, never to the caller. Relayers and borrowers can both backfill history, and neither can forge it.

---

## What is integrated, precisely

### 1. `ASCBase` - the canonical readability base

[`contracts/MeritrAttestor.sol`](../contracts/MeritrAttestor.sol) inherits **`ASCBase`** from the official [`@gluwa/asc-contracts`](https://www.npmjs.com/package/@gluwa/asc-contracts) package. It is not a reimplementation: `ASCBase` performs the precompile call and the query-id deduplication, and Meritr supplies the application logic through `_processAndEmitEvent`.

```solidity
import {ASCBase} from "@gluwa/asc-contracts/contracts/readability/ASCBase.sol";

contract MeritrAttestor is ASCBase, AccessControl, IMeritrAttestor {
```

### 2. `INativeQueryVerifier` - the BlockProver precompile at `0x…0FD2`

Verification runs against the native precompile. `ASCBase` resolves it via `NativeQueryVerifierLib`, and Meritr exposes the address it trusts so an integrator can check it:

```solidity
function verifierPrecompile() external view returns (address) {
    return address(VERIFIER);   // 0x0000000000000000000000000000000000000FD2
}
```

### 3. `EvmV1Decoder` - proven-transaction decoding

The precompile proves a transaction happened; it does not interpret it. Meritr decodes the prover's chunked `abi.encode(uint8 txType, bytes[] chunks)` payload with the protocol's own **`EvmV1Decoder`**, extracts the receipt, rejects any source transaction that reverted, and filters logs by event signature.

### 4. `ChainInfo` precompile at `0x…0FD3` - chainKey correctness

`chainKey` is the Attestcoin protocol's own identifier and is **not** the EVM chain id. Worse, the same source chain has a **different key on each Creditcoin network**:

| Source chain | Creditcoin Mainnet (102030) | Creditcoin Testnet (102031) |
|---|---|---|
| Ethereum (EVM 1) | `1` | **`3`** |
| Ethereum Sepolia | not registered | `1` |

Getting this wrong fails *silently* - proofs simply never match a registered schema and no history ever lands. Meritr therefore reads the authoritative mapping from the **ChainInfo precompile** via `get_supported_chains()` and verifies its catalogue against it at deploy time ([`scripts/verifyChainKeys.js`](../scripts/verifyChainKeys.js)). A mismatch aborts the deployment rather than shipping.

### 5. The proof-builder service - real proofs, not fixtures

[`scripts/attestcoin/prover.js`](../scripts/attestcoin/prover.js) is a client for Creditcoin's **Proof Builder API**:

```
GET /api/v1/attested-height/{chainKey}
GET /api/v1/proof-by-tx/{chainKey}/{txHash}
```

Its response maps directly onto `MeritrAttestor.ingest`: `txBytes` → `encodedTransaction`, `merkleProof` → `root` + `siblings`, `continuityProof` → `lowerEndpointDigest` + `roots`.

### 6. An onchain event schema registry - extensible without redeployment

Rather than hard-coding Aave's ABI, Meritr keeps a registry of `(chainKey, emitter, topic0) → schema` describing where the borrower and the amount sit inside a log. Supporting Compound, Morpho or a new Aave market is a registry write, not a redeploy - and an **unregistered emitter is ignored**, so a proof of a log from an attacker's own contract contributes nothing.

---

## Verified end to end against real Ethereum mainnet history

This is the part that distinguishes a shaped integration from a working one. Every step below was executed against live infrastructure.

**Source transaction** - a genuine Aave V3 repayment on Ethereum mainnet:

```
tx       0x7db669953c8d25a9132cd3f0c7bd5c7fe2c2ffbc64cc5fb4797f47e94d596e4a
block    25,931,487
event    Repay(reserve=USDT, user=0x76f30e3f75437fB862B8D2C4D80a671bCeBA5b1A, …)
amount   67,465.398756 USDT
```

| Step | Result |
|---|---|
| Proof Builder returned an envelope for `chainKey 3` | 10,208-byte `txBytes`, real Merkle root, **7 Merkle siblings** and a continuity chain - 14 roots at the time of writing, and it lengthens as the attested height advances past the transaction's block |
| **Live `0x…0FD2` on Creditcoin testnet** `verify()` | **ACCEPTED** |
| Same proof with one sibling hash tampered | **REJECTED** |
| Meritr's decoder on the real payload | borrower `0x76f30e…`, reserve USDT, **$67,465.40** |
| Resulting onchain credit memory | 1 repayment · 1 chain · **ZK-Credit score 497** |

Reproduce it:

```bash
npm run proof -- 0x7db669953c8d25a9132cd3f0c7bd5c7fe2c2ffbc64cc5fb4797f47e94d596e4a --chain-key 3
npm run proof:decode
```

The negative control matters as much as the positive one: a tampered proof is refused by the runtime, which is the property the whole trust model rests on.

---

## What the attested data actually drives

Attestcoin-proven facts are not decorative - they are the sole input to every economic decision Meritr makes.

| Attested fact | Where it lands |
|---|---|
| Repayment volume and count | 35% of the credit score |
| Collateral supplied | 25% |
| Wallet maturity (from proven block height) | 15% |
| Distinct source chains proven | 10% |
| Liquidation events | 15%, compounding −30% each |

That score then sets:

- **Interest rate** - 24.00% APR at score 300, falling to 4.00% at 900
- **Borrowing capacity** - 30% LTV at 300, rising to 80% at 900
- **Restructuring terms** - recomputed onchain from the live attested score

A wallet with **no** Attestcoin proofs scores exactly 300 and receives the protocol's worst terms. There is no unearned credit anywhere in the curve.

---

## Why this fits the AI track

> *"Deploy AI apps on Creditcoin that process cryptographically verified cross-chain data to autonomously inform decisions and trigger onchain transactions without centralized oracle operators."*

Meritr's DeAI underwriting agent ([`agents/underwriter.py`](../agents/underwriter.py)) discovers every borrower from chain logs, classifies each position against the vault's health bands, projects time-to-liquidation, ranks the book by the loss an intervention would avert, and broadcasts `restructure(borrower)` - all from data that carries an Attestcoin proof.

The safety property that makes this defensible:

```solidity
function restructure(address borrower) external returns (uint256, uint256, uint256);
```

**One argument.** No rate, no amount, no score. The vault re-reads the borrower's Attestcoin-derived score and recomputes every term onchain. The agent decides *whom and when*; the chain decides *how much*. A fully compromised agent key can only trigger restructurings the protocol would already have approved.

To make that claim checkable rather than asserted, the agent's Python scoring model mirrors the Solidity library exactly - integer truncation included - and **168 vectors generated from the deployed contract** assert every component of every score matches ([`tests/test_parity.py`](../tests/test_parity.py)).

---

## Checkable without cloning anything

Two of the claims above are runnable rather than asserted.

`npm run verify:proof` fetches a genuine Aave V3 proof, asks the live precompile at `0x…0FD2`
to judge it, then flips a single byte inside the proven transaction and asks again. It is a
view call, so it needs no gas, no wallet and no funded account:

```
genuine proof      -> ACCEPTED
one byte altered   -> REJECTED (Merkle proof validation failed)
```

And every contract is source-verified on Blockscout, so the ingestion path can be read on chain
rather than taken from this document:
[MeritrAttestor](https://creditcoin-testnet.blockscout.com/address/0xB462C2772b8003e3c511C373dDC5715642B34D4c#code).

---

## Honest limitations

Stated because a credit protocol that hides its assumptions is not one anyone should use.

- **Collateral marks inside the vault are governance-fed.** Every *credit fact* carries a proof, but the vault's own collateral price is set behind `PRICE_ROLE`. It is the single trusted input in the risk path; production needs a real feed.
- **Source-block timestamps are approximated.** The prover exposes a verified *height*, not a verified timestamp, so wallet maturity is derived as `genesis + height × blockTime`, clamped to `block.timestamp` so no height can manufacture future history.
- **The passport's `factsCommitment` is a hash commitment, not a zero-knowledge proof.** It hides values and supports selective disclosure; it proves nothing about them on its own. It is the substitution point for a range proof.
- **The contracts are unaudited.**

---

## Where to look in the repository

| Path | What it does |
|---|---|
| [`contracts/MeritrAttestor.sol`](../contracts/MeritrAttestor.sol) | `ASCBase` integration, schema registry, fact folding |
| [`scripts/attestcoin/prover.js`](../scripts/attestcoin/prover.js) | Proof Builder API client |
| [`scripts/attestcoin/fetchProof.js`](../scripts/attestcoin/fetchProof.js) | CLI - fetch a real proof for any source tx |
| [`scripts/attestcoin/decodeCheck.js`](../scripts/attestcoin/decodeCheck.js) | Runs a real proof through the production decoder |
| [`scripts/verifyChainKeys.js`](../scripts/verifyChainKeys.js) | Catalogue vs. the ChainInfo precompile |
| [`scripts/sourceSchemas.js`](../scripts/sourceSchemas.js) | Aave V3 event schemas and per-network chainKeys |
| [`test/MeritrAttestor.test.js`](../test/MeritrAttestor.test.js) | 15 tests over the ingestion path |
| [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) | Full technical reference |
