# 💳 MERITR — Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS

> **BUIDL CTC 2026 Fall Hackathon Master Blueprint ($15,000 Prize Pool)**  
> **Host:** Creditcoin & Credit Labs (`dorahacks.io/hackathon/buidl-ctc-2026-fall/detail`)  
> **Target:** 1st Place / Grand Prize ($10,000 Cash + CEIP Investment Fast-Track + CertiK Audit)  
> **Submission Deadline:** September 13, 2026 @ 23:59 ET  
> **Primary Track:** `AI` / `RWA`  
> **Core Tech Stack:** Creditcoin EVM Network + Attestcoin Protocol (`attestcoin-sdk` / Precompile `0x0FD2`) + Solidity + Next.js 14 + Python 3.11  
> **License:** Apache 2.0 Open Source  
> **Author:** Ifeanyichukwu Onwo (`mrnetwork`)  

---

## 📌 Executive Summary & Core Value Proposition

Creditcoin has processed over $70M+ in real-world credit loans, yet cross-chain credit history remains fragmented across isolated networks. Existing hackathon entries offer passive, read-only credit scorecards that do nothing to actively protect capital or prevent borrower default.

**MERITR** is an **Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS** built natively on Creditcoin.

Meritr uses the **Attestcoin Protocol** (`0x0FD2` precompile) to ingest cryptographically verified user balances and loan status from Ethereum, Base, and Solana *without centralized oracle operators*. An autonomous AI Risk Agent calculates dynamic credit scores and **actively restructures at-risk loans on Creditcoin**, adjusting interest rates and extending micro-refinancing before liquidations occur.

---

## 🏗️ Technical Architecture & Attestcoin Data Flow

```
   ┌────────────────────────────────────────────────────────┐
   │     CROSS-CHAIN SOURCE DATA (Ethereum, Base, Solana)   │
   │    (Aave Repayments, Compound Balances, Wallet Age)    │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │       ATTESTCOIN PROTOCOL (USC SDK / Precompile 0x0FD2)│
   │  (Cryptographically verifies cross-chain data payload) │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │        MERITR DEAI RISK & UNDERWRITING ENGINE           │
   │   (Computes ZK-Credit Memory & Liquidation Risk Score) │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │      CREDITCOIN AUTONOMOUS DEBT RESTRUCTURING VAULT    │
   │  (MeritrVault.sol auto-refinances & adjusts interest)   │
   └────────────────────────────────────────────────────────┘
```

---

## 🌟 4 Key Moat Subsystems

### 1. Attestcoin Cross-Chain Data Ingestion (`attestcoin-sdk`)
- Integrates Creditcoin's official `0x0FD2` Attestcoin precompile to verify source-chain repayments on Ethereum Sepolia without oracle risk.

### 2. Autonomous DeAI Risk Agent (`agents/underwriter.py`)
- Processes cryptographically attested data payloads, generating dynamic ZK-Credit scores and monitoring liquidation threat levels.

### 3. Auto-Refinancing & Restructuring Vault (`contracts/MeritrVault.sol`)
- Smart contracts on Creditcoin that automatically execute debt restructuring, extending micro-refinancing when an off-chain asset undergoes stress.

### 4. Soulbound Cashflow Passport (`contracts/MeritrPassport.sol`)
- Issues non-transferable ERC-721 credit passports encoding verified cross-chain credit history on Creditcoin.

---

## 📋 Required Submission Package Checklist

- [x] Public GitHub repository (`mrnetwork/Meritr`), Apache 2.0.
- [x] Working Attestcoin Protocol integration — `MeritrAttestor` inherits `ASCBase` from
      `@gluwa/asc-contracts` and calls the native query verifier precompile `0x…0FD2`.
- [x] Four subsystems implemented and tested (48 contract tests, 39 Python tests).
- [x] One-command deployment: `npx hardhat run scripts/deploy.js --network creditcoinTestnet`.
- [x] Technical documentation & setup guide — `README.md`, `docs/ARCHITECTURE.md`.
- [x] End-to-end demo walkthrough — `npx hardhat run scripts/simulate.js`.
- [x] Deployed contract addresses on Creditcoin Testnet (102031) — see
      `deployments/creditcoinTestnet.json` and the README.
- [x] A **real** Attestcoin proof ingested on the live deployment: an Ethereum mainnet
      Aave V3 repayment, verified by the `0x…0FD2` precompile with no mock involved.
- [ ] Project Deck / Whitepaper PDF URL.
- [ ] Prototype Demo Video URL.

> **Correction to an earlier assumption in this spec:** there is no `attestcoin-sdk` package on
> npm. The real Attestcoin packages are `@gluwa/asc-contracts` and `@gluwa/asc-contracts-abi`;
> readability integrations inherit `ASCBase`. The precompile address `0x0FD2` was correct.

---

## 📄 License
Apache 2.0 Open Source
