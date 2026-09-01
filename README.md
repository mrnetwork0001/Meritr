# 💳 Meritr — Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS

> Built for **BUIDL CTC 2026 Fall Hackathon** on DoraHacks by **Creditcoin & Credit Labs** ($15,000 Prize Pool)  
> **Target:** 1st Place / Grand Prize ($10,000 Cash + CEIP Investment Fast-Track + CertiK Audit)  
> **Submission Deadline:** September 13, 2026 @ 23:59 ET  
> **Primary Track:** `AI` / `RWA`  
> **Core Tech Stack:** Creditcoin EVM Testnet + Attestcoin Protocol (`attestcoin-sdk` / `0x0FD2`) + Solidity + Next.js 14  
> **License:** Apache 2.0 Open Source  

---

## 📌 Overview

**Meritr** is an **Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS** built natively on Creditcoin.

- **Attestcoin Protocol (`0x0FD2` Precompile):** Ingests cryptographically verified repayment data from Ethereum/Base without oracle operators.
- **DeAI Risk Agent (`agents/underwriter.py`):** Calculates dynamic ZK-Credit scores and evaluates cross-chain liquidation threats.
- **Auto-Refinancing Vault (`contracts/MeritrVault.sol`):** Automatically restructures loans and adjusts interest rates on Creditcoin before liquidations occur.
- **Soulbound Passport (`contracts/MeritrPassport.sol`):** Non-transferable credit memory passport for RWA borrowers.

---

## 🚀 Quickstart & Setup Instructions

### 1. Prerequisites
- Node.js 18+ & Hardhat
- Python 3.11+
- Creditcoin Testnet RPC (`Chain ID: 102031`)

### 2. Installation
```bash
git clone https://github.com/mrnetwork/Meritr.git
cd Meritr
npm install
pip install -r requirements.txt
```

### 3. Deploy Smart Contracts to Creditcoin Testnet
```bash
npx hardhat run scripts/deploy.js --network creditcoinTestnet
```

---

## 📄 License
Apache 2.0 Open Source
