# Meritr - Technical Architecture

Companion to the [README](../README.md). This document covers the mechanisms in enough detail
for a security reviewer or an integrator, including the parts that are approximations.

---

## 1. Trust model

The question any credit protocol has to answer is: *whose word is each number taken on?*

| Input | Source | Trusted party |
|---|---|---|
| Source-chain repayments, supplies, liquidations | Attestcoin precompile `0xFD2` | **none** - the Creditcoin runtime validates the proof |
| Which contract addresses count as "Aave V3 on Ethereum" | onchain schema registry | `REGISTRAR_ROLE` |
| Token decimals and USD price of source reserves | `assetConfigs` | `REGISTRAR_ROLE` |
| Credit score, APR, max LTV | `CreditMath`, pure function of attested facts | **none** - deterministic |
| Vault collateral / asset marks | `setPrices` | `PRICE_ROLE` |
| *Whether* to restructure a given borrower | DeAI agent | `RISK_AGENT_ROLE`, **or anyone** after the grace period |
| *How much* relief a restructuring grants | `MeritrVault`, recomputed onchain | **none** - deterministic |

The two governance roles bound *interpretation* (which logs mean what, what collateral is worth).
Neither can assert a credit fact. `REGISTRAR_ROLE` cannot credit a borrower who has no proofs;
it can only decide whether a proven log is recognised at all.

**`PRICE_ROLE` is the honest weak point.** Collateral marks drive the health factor, so a
compromised price key can push a healthy position into the liquidatable band. This is the same
exposure every lending market has to its oracle, and production deployment should put a real
price feed behind it. It is called out here rather than buried.

---

## 2. Attestcoin ingestion path

### 2.1 What the precompile guarantees

`INativeQueryVerifier` at `0x0000000000000000000000000000000000000FD2` (`0xFD2` = 4050) verifies:

- **Merkle inclusion** - the transaction is in the block's transaction trie under `merkleRoot`.
- **Continuity** - that block descends from a chain endpoint the runtime already trusts.

It returns the proven transaction bytes; it does not interpret them. Everything downstream is
Meritr's own decoding, which is why the emitter allowlist matters.

### 2.2 The chain-key plumbing problem, and how it is solved

`ASCBase.execute` is `external` and **not** `virtual`, and its callback

```solidity
function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction)
```

does not carry `chainKey`. But a credit fact is meaningless without knowing which chain proved
it - chain diversity is a scored component, and asset configs are per-chain.

Meritr does not fork `ASCBase` to fix this. `ingest()` records the chain key in storage, then
self-calls `this.execute(...)` so the canonical verification and dedupe path runs exactly as
shipped:

```solidity
_activeChainKey = chainKey;
bool ok = this.execute(action, chainKey, blockHeight, encodedTransaction, /* proof… */);
_activeChainKey = 0;
```

`_processAndEmitEvent` reverts with `DirectExecuteForbidden` when `_activeChainKey == 0`, which
also closes the bypass: calling the inherited `execute` directly reverts rather than silently
attributing a proof to chain zero.

### 2.3 The event schema registry

A log is only credit-relevant if `schemas[chainKey][log.address_][log.topics[0]].enabled`. The
schema says where to read the borrower and the amount:

```solidity
struct EventSchema {
    bool    enabled;
    uint8   action;        // REPAYMENT | COLLATERAL | LIQUIDATION | BORROW
    uint8   subjectTopic;  // indexed slot holding the borrower; 0 => read from data
    uint8   subjectWord;   // data word index when subjectTopic == 0
    uint8   reserveTopic;  // indexed slot holding the reserve asset; 0 => fallbackAsset
    uint8   amountWord;    // data word index of the amount
    address fallbackAsset;
}
```

Worked example - Aave V3 `Repay`:

```
Repay(address indexed reserve, address indexed user, address indexed repayer,
      uint256 amount, bool useATokens)

topics = [sig, reserve, user, repayer]      data = [amount, useATokens]
                       ^^^^                        ^^^^^^
            subjectTopic = 2                   amountWord = 0
            reserveTopic = 1
```

`subjectTopic = 2` selects `user` - the borrower whose debt shrank - **not** `repayer`. A third
party repaying someone's loan credits the borrower, which is the economically correct
attribution and closes an obvious credit-farming vector.

The full catalogue lives in [`scripts/sourceSchemas.js`](../scripts/sourceSchemas.js) and is
registered at deploy time.

### 2.4 Attribution and replay safety

| Attack | Defence |
|---|---|
| Forge a repayment | Precompile rejects any transaction without a valid inclusion + continuity proof. |
| Replay a real proof to inflate a score | `ASCBase` dedupes by `queryId = keccak(chainKey, height, txIndex)`. |
| Emit a lookalike event from your own contract | Emitter must be registered per chain; unregistered emitters are ignored, and the tx emits `NoRecognisedFacts`. |
| Submit a proof of a *reverted* transaction | `receiptStatus != 1` reverts with `SourceTxReverted`. |
| Claim someone else's history | The credited address is decoded from the proven log, not taken from `msg.sender`. |
| Manufacture wallet maturity from a future block height | Derived timestamps are clamped to `block.timestamp`. |
| Overflow USD normalisation with an absurd log value | Amounts above `1e30` contribute zero value. |

### 2.5 The maturity approximation

The prover exposes a verified **height**, not a verified **timestamp**. Wallet maturity is
therefore estimated:

```
sourceTime ≈ min(genesisTimestamp + height × blockTimeSeconds, block.timestamp)
```

Monotone in height, derived entirely from proof-verified data, and bounded above. It is an
approximation, deliberately, and it is the only inferred quantity in the scoring path.

---

## 3. Credit scoring

Score domain 300–900. Weights sum to 10,000 bps; a test asserts it.

| Component | Weight | Saturation | Rationale |
|---|---|---|---|
| Repayment history | 35% | $250k repaid / 40 events | 60/40 blend of value and frequency, so neither one whale repayment nor forty dust repayments alone saturates it |
| Cross-chain collateral | 25% | $150k supplied | proven capacity to post assets |
| Wallet maturity | 15% | 730 days | history length, from the approximation in §2.5 |
| Chain diversity | 10% | 4 chains | credit proven across many chains is harder to manufacture |
| Liquidation safety | 15% | - | starts full, each liquidation compounds a 30% cut |

Two deliberate choices:

- **An unattested wallet scores exactly 300.** There is no unearned credit anywhere in the curve.
- **Safety is withheld until at least one proof exists.** A wallet with no history has not
  *proven* safety, it has merely produced no evidence. Awarding the safety component by default
  would hand a fresh wallet 90 free points for having done nothing.

Pricing curves are linear and monotone - verified across the full domain in
[`tests/test_parity.py`](../tests/test_parity.py):

```
APR      = 24.00% at score 300 → 4.00% at 900   (non-increasing)
max LTV  = 30.00% at score 300 → 80.00% at 900  (non-decreasing)
```

---

## 4. The vault

### 4.1 Health bands

```
        liquidatable │      stress band      │  watch  │        healthy
     ────────────────┼───────────────────────┼─────────┼──────────────────▶
                    1.00                    1.15      1.30            HF

     liquidate()     │   restructure()       │  monitor only
                     │   target: HF 1.35     │
```

`restructure` reverts outside `[1.00, 1.15)`. Below 1.00 is deliberate: absorbing an underwater
position would move a **real, already-crystallised loss** onto the reserve - that is
socialising bad debt, not preventing it.

### 4.2 The three levers

```solidity
// Lever 1 - rate relief, recomputed from live cross-chain credit
uint16  liveScore = ATTESTOR.scoreOf(borrower).score;
uint256 earned    = CreditMath.aprBps(liveScore);
uint256 floorRate = max(oldRate - MAX_RATE_RELIEF_BPS, RELIEF_FLOOR_BPS);
if (max(earned, floorRate) < oldRate) loan.rateBps = max(earned, floorRate);

// Lever 2 - term extension
loan.maturity = max(loan.maturity, block.timestamp) + EXTENSION_PERIOD;

// Lever 3 - reserve-funded micro-refinance
uint256 sustainable = CreditMath.sustainableDebtE8(collateralE8, LIQ_THRESHOLD, TARGET_HF);
if (debtE8 > sustainable && reserveBalance > 0) {
    uint256 shortfall = _e8ToAsset(debtE8 - sustainable);
    uint256 cap       = reserveBalance * MAX_RESERVE_DRAW_BPS / BPS;
    debtRetired       = min(shortfall, cap);
}
```

Every input is read from storage or recomputed. **Nothing comes from the caller.**

### 4.3 Interest accounting

The subtle part, and the source of a bug caught during development.

Interest is charged to the borrower in full, but split between two claimants:

```
_accrue:   loan.interestOwed      += interest              // borrower owes all of it
           totalInterestOwed      += interest − reserveCut // lenders' claim
           pendingReserveInterest += reserveCut            // reserve's claim (15%)
```

An earlier version credited `reserveBalance` directly at accrual. That made
`loan.interestOwed > totalInterestOwed`, so a full repayment underflowed `totalInterestOwed` and
reverted - bricking repayment for any loan that had accrued interest.

Two fixes, both structural:

1. The reserve's share is booked as a **claim** (`pendingReserveInterest`), not as cash. The
   reserve may only ever *spend* money a borrower has actually paid in.
2. Every path that reduces debt - `repay`, `liquidate`, and reserve-funded refinancing - routes
   through a single `_settleDebt` helper, so the invariant

   ```
   Σ loan.interestOwed == totalInterestOwed + pendingReserveInterest
   ```

   holds by construction rather than by three separate copies of the same arithmetic.

`totalAssets()` = `totalIdle + totalPrincipal + totalInterestOwed`, deliberately **excluding**
the reserve. Counting the reserve as lender equity would let a lender withdraw the exact capital
earmarked to keep borrowers solvent. A test asserts the vault's real token balance always equals
`totalIdle + reserveBalance`.

### 4.4 Guardrails

| Guardrail | Value | Purpose |
|---|---|---|
| `MAX_RESTRUCTURES` | 3 per loan | forbearance cannot run forever |
| `RESTRUCTURE_COOLDOWN` | 12 hours | no reserve draining via rapid re-triggering |
| `MAX_RESERVE_DRAW_BPS` | 25% per event | one borrower cannot exhaust the reserve |
| `MAX_RATE_RELIEF_BPS` | 600 (6pp) | bounded repricing |
| `RELIEF_FLOOR_BPS` | 400 (4%) | relief never undercuts the protocol's best rate |
| `AGENT_GRACE_PERIOD` | 6 hours | after which anyone may restructure |

### 4.5 Agent liveness

`flagStress(borrower)` is permissionless and starts the grace clock. After
`AGENT_GRACE_PERIOD`, `restructure` accepts any caller. A borrower's protection therefore does
not depend on the agent's uptime - a property worth more than the agent's sophistication.

---

## 5. The DeAI agent

### 5.1 Why judgement is needed at all

The vault answers *"what relief is this borrower entitled to?"*. It has no portfolio view and no
price history. Choosing **whom to rescue first** when three positions are stressed and the
reserve can only carry one is the decision that belongs off-chain, where it can be revised
without a redeploy.

### 5.2 Triage signals

```python
buffer      = 1 − 1/HF                        # collateral drawdown until liquidation
days        = (buffer / σ)² × 365             # driftless random walk, σ = annual vol
deadweight  = debt × 5%                       # liquidation bonus is pure loss
probability = min(1, 7 / days)                # saturating one-week hazard
averted     = deadweight × probability        # the ranking signal
```

`days_to_liquidation` is a **triage heuristic, not a risk model**. It ignores drift, fat tails
and correlation. Its only job is to answer "which of these borrowers runs out of room first?",
and for that, monotonicity in the buffer is the property that matters - which is what the tests
pin, rather than any particular numeric output.

The loss estimate is deliberately *not* the whole debt: liquidation recovers most of it by
seizing collateral. What is actually destroyed is the bonus paid to the liquidator plus the
borrower's forfeited equity - the part restructuring genuinely saves.

### 5.3 Execution

1. Discover borrowers from `LoanOpened` logs - no external index, so a restarted agent rebuilds
   its complete working set from the chain alone.
2. Assess and triage.
3. **Simulate first** via `eth_call`, turning a would-be reverted transaction into a log line.
4. Broadcast; refresh the borrower's passport.

---

## 6. Cross-language parity

`agents/scoring.py` mirrors `CreditMath.sol` exactly, including integer truncation.

```bash
npx hardhat run scripts/generateParityVectors.js   # 168 vectors from the deployed library
pytest tests/test_parity.py
```

Vectors are produced by calling the **actual EVM implementation** through
`CreditMathHarness`, not by a second Python transcription - so the test compares Python against
real onchain behaviour. The sweep covers empty history, every saturation boundary, values past
saturation, heavy liquidation counts, future-dated activity, and a seeded pseudo-random spread.

Any change to `CreditMath.sol` requires regenerating the fixture. Treat a divergence as a build
failure, not a rounding curiosity: the agent's usefulness rests entirely on predicting the
chain's arithmetic bit for bit.

---

## 7. Testing local proof ingestion

Creditcoin implements `0xFD2` in the node runtime, so a local Hardhat chain has no code there.
Tests deploy `MockNativeQueryVerifier` and `hardhat_setCode` it to `0xFD2`.

This exercises the **real** path - the same external call, struct encoding, `calculateTxIndex`
dedupe and `EvmV1Decoder` chunk decoding. Only the runtime's cryptography is substituted; none
of Meritr's own logic is stubbed. `test/helpers.js` builds prover-format `txBytes`
(`abi.encode(uint8 txType, bytes[] chunks)`) exactly as the block prover emits it.

`setShouldVerify(false)` lets the suite assert Meritr genuinely refuses unproven data rather
than merely accepting whatever it is handed.

> **Note on `hardhat_setCode`:** it installs runtime bytecode but leaves storage empty, so the
> mock's `shouldVerify` flag starts `false` and must be switched on explicitly. This trips
> people; `installMockPrecompile()` handles it.

---

## 8. Deployment

### 8.1 Networks

Chain ids were verified live against the public RPC endpoints, because an earlier revision of
the Hardhat config had `102030` mislabelled as devnet:

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| **Creditcoin Mainnet** | **102030** | `https://mainnet3.creditcoin.network` | `creditcoin.blockscout.com` |
| Creditcoin Testnet | 102031 | `https://rpc.cc3-testnet.creditcoin.network` | `creditcoin-testnet.blockscout.com` |
| Creditcoin Devnet | 102032 | `https://rpc.cc3-devnet.creditcoin.network` | - |

The Attestcoin native query verifier was confirmed live on **mainnet**: an `eth_call` to
`calculateTxIndex` at `0x…0FD2` on chain 102030 returns a real value rather than the empty `0x`
an address with no code would give. `eth_getCode` returns `0x` there, which is normal for a
native precompile and is why `NativeQueryVerifierLib.hasPrecompile` falls back to a chain-id
check.

### 8.2 Source-chain catalogue is selected by target

`deploymentsFor(chainId)` returns the mainnet catalogue for 102030 and the testnet catalogue
otherwise. Registering Sepolia pools against a mainnet deployment would score borrowers on
activity that costs nothing to manufacture, so the two are never mixed.

Every mainnet address was verified onchain - contract code present, and ERC-20 `symbol()` /
`decimals()` read back - rather than copied from documentation:

| Chain | Aave V3 Pool | Reserves registered |
|---|---|---|
| Ethereum (1) | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | USDC, USDT, DAI |


### 8.3 Running it

```bash
MERITR_CONFIRM_MAINNET=yes MERITR_ASSET=0x… MERITR_COLLATERAL=0x… \
  npx hardhat run scripts/deploy.js --network creditcoinMainnet
```

Two gates guard mainnet: an explicit confirmation, and a refusal to deploy the freely-mintable
`MockERC20` demo pair. Both are one environment variable to clear - they exist to make the step
deliberate, not to obstruct it.

Deploys the four subsystems, grants `RISK_AGENT_ROLE` and `REFRESHER_ROLE`, registers source
chains, priced assets and Aave V3 schemas, then writes `deployments/<network>.json` - the single
address book the agent, API and frontend all read, so a fresh deploy propagates everywhere with
no hand-edited config.

The script preflights the precompile and refuses to run with a zero balance rather than failing
halfway through a multi-transaction setup.

On testnet, the vault deploys a demo ERC-20 pair when `MERITR_ASSET` / `MERITR_COLLATERAL` are
unset, since Creditcoin testnet has no canonical stablecoin. On mainnet that fallback is
blocked by default.

---

## 9. Known limitations

1. **Collateral pricing is governance-fed** (§1). The single trusted input in the risk path.
2. **Source timestamps are approximated** from block height (§2.5).
3. **`chainKey` is not the EVM chain id** and differs per Creditcoin network - Ethereum is
   `3` on testnet and `1` on mainnet. Read from the ChainInfo precompile and verified at
   deploy time by `scripts/verifyChainKeys.js`.
4. **Non-stable reserves need a price feed** before registration.
5. **"ZK-Credit" is a hash commitment, not a SNARK.** `factsCommitment` hides values and enables
   selective disclosure, but proves nothing about them on its own. It is the substitution point
   for a range proof - future work, not a present claim.
6. **Single collateral asset per vault.** Multi-collateral is a natural extension; it would
   change the health-factor math from scalar to a weighted basket.
7. **The contracts are unaudited.** A CertiK audit is a hackathon prize rather than a completed
   step, which is precisely why mainnet deployment sits behind an explicit gate.
