---
name: meritr-creditcoin
description: Architecture, invariants and Attestcoin Protocol (0xFD2 precompile) rules for Meritr — the Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS on Creditcoin, built for the BUIDL CTC 2026 Fall Hackathon.
---

# Meritr — Creditcoin Attestcoin Development Guide

Use this whenever working on Meritr. It records the decisions that are easy to break by
accident.

## Verified facts about the stack

- The Attestcoin **native query verifier precompile** is at
  `0x0000000000000000000000000000000000000FD2` (`0xFD2` = 4050). Creditcoin chain ids that carry
  it: **102030** (devnet), **102031** (testnet), **102032**.
- The real packages are **`@gluwa/asc-contracts`** (Solidity source) and
  **`@gluwa/asc-contracts-abi`**. There is **no `attestcoin-sdk` package on npm** — early specs
  referred to it by that name.
- Readability integrations inherit **`ASCBase`**
  (`@gluwa/asc-contracts/contracts/readability/ASCBase.sol`), which calls the precompile and
  dedupes by query id.
- Proven transactions decode with **`EvmV1Decoder`**
  (`@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol`). Encoding is
  `abi.encode(uint8 txType, bytes[] chunks)`; the receipt is the **last** chunk (index 2 for tx
  types 0–2, index 3 for types 3–4).
- ASC sources pin `pragma ^0.8.28`, so Hardhat must compile at **0.8.28** (Meritr uses
  `viaIR: true`, `evmVersion: paris`).

## Invariants — do not break these

1. **`restructure(address)` takes no economic parameters.** Adding a rate, amount or score
   argument destroys the security model: the agent must be able to choose *whom*, never
   *how much*. Every term is recomputed on-chain from the attested score.
2. **`agents/scoring.py` must match `contracts/libraries/CreditMath.sol` exactly**, integer
   truncation included. After any change to `CreditMath.sol`:
   ```
   npx hardhat run scripts/generateParityVectors.js && pytest tests/test_parity.py
   ```
   A divergence is a build failure, not a rounding curiosity.
3. **`Σ loan.interestOwed == totalInterestOwed + pendingReserveInterest`.** Every debt-reducing
   path (`repay`, `liquidate`, reserve refinancing) must go through `_settleDebt`. Crediting
   `reserveBalance` at accrual time instead of booking `pendingReserveInterest` caused a real
   repayment-underflow bug — do not reintroduce it.
4. **`totalAssets()` excludes `reserveBalance`.** The reserve is not lender equity.
5. **Restructuring is refused below HF 1.00.** Absorbing an underwater position socialises
   crystallised bad debt into the reserve.
6. **Soulbinding is enforced at `_update`**, the single chokepoint for all ERC-721 movement.
   Overriding individual transfer functions instead would leave paths open.
7. **`_processAndEmitEvent` must revert when `_activeChainKey == 0`**, which blocks a direct
   `ASCBase.execute` call from mis-attributing a proof.

## Local testing

`0xFD2` has no bytecode on Hardhat. Use `installMockPrecompile()` from `test/helpers.js`, which
deploys `MockNativeQueryVerifier` and `hardhat_setCode`s it to the precompile address.

**`hardhat_setCode` installs bytecode but leaves storage empty**, so the mock's `shouldVerify`
starts `false` and must be set explicitly — the helper does this.

Build proof payloads with `encodeProvenTx()` so tests drive the real `EvmV1Decoder` path rather
than a stub.

## Adding a source protocol

No contract change is required. Add an entry to `scripts/sourceSchemas.js` and call
`registerSchema(chainKey, emitter, topic0, schema)`. `subjectTopic` must select the account
whose credit is affected — for Aave `Repay` that is `user` (topic 2), **not** `repayer`.

## Commands

```
npx hardhat compile / test                     contracts (48 tests)
pytest                                         agent + parity (39 tests)
npx hardhat run scripts/deploy.js --network creditcoinTestnet
npx hardhat run scripts/simulate.js            six-act walkthrough
python3 main.py                                project doctor
```

## Claims to keep honest

- `factsCommitment` is a **hash commitment, not a zero-knowledge proof**. It hides values and
  supports selective disclosure; it proves nothing about them on its own. Do not describe it as
  a SNARK.
- Collateral pricing is governance-fed via `PRICE_ROLE` — the one trusted input in the risk path.
- Wallet maturity is **approximated** from proven block height, clamped to `block.timestamp`.
