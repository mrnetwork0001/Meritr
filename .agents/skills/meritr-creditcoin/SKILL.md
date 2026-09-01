---
name: meritr-creditcoin
description: Architecture, guidelines, Attestcoin Protocol (USC SDK / 0x0FD2 precompile), and Creditcoin EVM rules for Meritr built for the BUIDL CTC 2026 Fall Hackathon.
---

# 💳 Meritr — Creditcoin Attestcoin AI Hackathon Skill & Execution Guide

Use this skill whenever working on, reviewing, or developing **Meritr** — the Autonomous DeAI Debt Restructuring & Cross-Chain Credit Risk Memory OS on Creditcoin.

## 📌 Project Overview & Target
- **Target Event:** BUIDL CTC 2026 Fall Hackathon (DoraHacks)
- **Prize Target:** 1st Place / Grand Prize ($10,000 Cash + CEIP Investment Fast-Track + CertiK Audit)
- **Primary Track:** AI / RWA
- **Attestcoin Integration:** `attestcoin-sdk` + Precompile `0x0FD2`
- **Core Tech Stack:** Creditcoin EVM Testnet (Chain ID 102031) + Solidity + Next.js 14 + Python 3.11

## 🏗️ Technical Architecture Rules

### 1. Attestcoin Precompile Integration (`0x0FD2`)
- Ingest cross-chain proofs from Ethereum Sepolia via Attestcoin Protocol precompile `0x0FD2` without trusted oracles.

### 2. Autonomous DeAI Risk Agent (`agents/underwriter.py`)
- Compute ZK-Credit scores and evaluate liquidation threat levels dynamically.

### 3. Creditcoin Smart Contracts (`contracts/`)
- Deploy `MeritrVault.sol` (auto-refinancing) and `MeritrPassport.sol` (soulbound credit history) to Creditcoin EVM Testnet.

## 🚨 Submission Checklist
- Public GitHub repo under OSI-approved license (Apache 2.0 / MIT).
- Deployed smart contracts on Creditcoin Testnet.
- Project Deck / Whitepaper PDF URL.
- Demo video walkthrough URL.
