# 🚀 Credaris — Privacy-Preserving Credit & Lending on Aleo

🚀 **Fully deployed on Aleo Testnet — try it live below**

## 🔗 Live Links

- 🌐 **Live App:** [credaris.vercel.app](https://credaris.vercel.app/)
- 📜 **Documentation:** [credaris.vercel.app/docs](https://credaris.vercel.app/docs)
- ⛓ **Deployed Contract:** [core_credaris.aleo](https://testnet.explorer.provable.com/program/core_credaris.aleo)


## 🧠 Problem

DeFi lending today is broken in three fundamental ways:

- **Overcollateralization** — Protocols like Aave and Compound require 150–200% collateral for every loan. This locks billions in capital that could be productive elsewhere.
- **No credit identity** — Every borrower is treated the same. There's no way to prove you're a reliable borrower without exposing your entire financial history.
- **Zero privacy** — Existing lending protocols expose loan amounts, balances, and repayment behavior on-chain for anyone to see.

The result: inefficient capital markets, no way to build reputation, and no privacy.


## 💡 Solution

Credaris introduces credit-scored, privacy-preserving lending to DeFi using Aleo's zero-knowledge proof system.

1. **Private Income Verification** — Users prove their on-chain income without revealing amounts. A ZK proof is generated and stored as an encrypted record.
2. **Private Credit Scoring** — A credit score (300–850) is computed from income, repayment history, and missed payments — entirely inside a ZK circuit. Only the risk tier (A/B/C/D) is published publicly.
3. **Risk-Based Collateral** — Better credit = less collateral. Tier A requires only 10%. Tier D requires 200%. This unlocks capital efficiency that fixed-ratio protocols cannot match.
4. **Fully On-Chain Execution** — Loans are funded, repaid, and settled entirely on-chain using `credits.aleo` transfers. No off-chain trust. No simulation.


## 🔥 Key Features

- 🔐 **ZK Income Verification** — Analyze wallet transactions and attest income privately on-chain
- 🧠 **Private Credit Scoring** — Score computed in ZK circuit, stored in encrypted `CreditReport` record
- 💰 **Risk-Based Lending** — Tier A (10%), B (25%), C (40%), D (200%) collateral ratios
- ⚡ **Atomic Execution** — Lock collateral + request loan in a single 2-step atomic flow
- 🏦 **Real On-Chain Escrow** — Collateral locked/unlocked via `credits.aleo` transfer functions
- 🔄 **Full Loan Lifecycle** — Request → Fund → Repay → Settle, all enforced on-chain
- 🔓 **Default Protection** — Lenders can claim collateral if borrower defaults past due date


## 🧱 Architecture

Credaris is a **unified smart contract** (`core_credaris.aleo`) with three logical modules:

### Income Module
- `attest_income()` — Generates an encrypted `IncomeProof` record with verified income data
- Publishes only a commitment hash and attestation count to public mappings

### Credit Module
- `compute_score()` — Computes a 300–850 credit score from: verified income, repayment count, total repaid, missed payments
- Outputs an encrypted `CreditReport` record (score + breakdown)
- Publishes only `has_score: bool` and `credit_tier: u8` publicly

### Lending Module
- `lock_collateral()` / `unlock_collateral()` — Escrow via `credits.aleo`
- `request_loan()` — Creates a `LoanRequest` record with hash-bound parameters
- `approve_loan()` — Lender funds the loan atomically, creating `LoanAgreement` records for both parties
- `repay_loan()` — Borrower repays, generating a `RepaymentReceipt`
- `claim_default()` — Lender claims collateral after due date

### Data Model

| Data | Storage | Visibility |
|------|---------|------------|
| Income proof | Encrypted record | Owner only |
| Credit score | Encrypted record | Owner only |
| Credit tier | Public mapping | Public (A/B/C/D) |
| Loan terms | Encrypted record | Borrower + Lender |
| Collateral balance | Public mapping | Public |
| Repayment history | Public mapping | Public (count only) |


## 🔒 Privacy Model

Credaris separates **what is proven** from **what is revealed**:

- **Income amounts** → stored in encrypted `IncomeProof` records. Only a commitment hash is public.
- **Credit scores** → stored in encrypted `CreditReport` records. Only the tier bucket (A/B/C/D) is public.
- **Loan terms** → stored in encrypted `LoanAgreement` records. Only `loan_active` flag is public.
- **Repayment amounts** → recorded as aggregate counters in public mappings. Individual payment details stay private.

All computations (income verification, score calculation, collateral checks) happen inside Leo's ZK circuits. The blockchain verifies the proof — not the data.


## 💰 Fund Flow

Every financial operation in Credaris moves **real ALEO tokens** on-chain:

1. **Lock Collateral** → Borrower calls `credits.aleo/transfer_public_to_public` to move ALEO into the contract's escrow
2. **Fund Loan** → Lender calls `approve_loan()` which atomically transfers the loan amount to the borrower via `credits.aleo`
3. **Repay Loan** → Borrower calls `repay_loan()` which transfers repayment to the lender via `credits.aleo`
4. **Settle/Default** → On full repayment, collateral is returned. On default past due date, lender calls `claim_default()` to claim collateral

> **This system uses real on-chain transfers — no simulation or off-chain trust.**


## 🔁 User Flow

```
1. Verify Income      → Analyze wallet transactions, generate ZK income proof
2. Compute Credit     → Score computed privately (300–850), tier assigned (A–D)
3. Request Loan       → Lock collateral + submit loan request (atomic 2-step)
4. Fund Loan          → Lender reviews and funds atomically
5. Repay Loan         → Borrower repays (partial or full)
6. Settle             → Collateral returned on full repayment
                      → Lender claims collateral on default
```


## 🎬 Demo

When testing the live app:

1. **Connect wallet** (Shield or Leo wallet on Aleo Testnet)
2. **Dashboard** → See your credit tier, balances, and next action prompt
3. **Income** → Click "Analyze Income" → then "Submit Income Proof"
4. **Credit** → Click "Compute Credit Score" → then "Decrypt & View Score" to see your private breakdown
5. **Lending → Borrow** → Enter amount, select duration → "Request Loan" (watch the 2-step progress UI)
6. **Lending → Browse** → Fund a loan from another wallet to complete the cycle
7. **Lending → Repay** → Decrypt loans → Repay to unlock collateral


## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Leo 4 on Aleo |
| Escrow | `credits.aleo` (native ALEO transfers) |
| Hash Computation | `@provablehq/wasm` (BHP256 in-browser) |
| Frontend | React + Vite |
| Wallet | Shield Wallet / Leo Wallet |
| Marketplace DB | Supabase (loan request indexing) |
| Deployment | Vercel |


## ⚠️ Security Considerations

- **No self-attestation trust** — Income attestation requires `assert_eq(avg_income, total_income / tx_count)` — the contract recomputes and verifies
- **Hash binding** — Loan requests are bound by `BHP256::hash_to_field()` over all parameters. Lender must recompute the same hash to fund
- **On-chain enforcement** — Collateral, funding, and repayment all use `credits.aleo` transfers. Frontend cannot bypass contract logic
- **Replay protection** — Each loan request uses a unique random nonce. `request_filled` mapping prevents double-funding
- **Default protection** — `claim_default()` asserts `block.height > due_by` before releasing collateral to lender


## 🌟 Why This Stands Out

- **Real DeFi** — Not a mockup. Real ALEO tokens are locked, transferred, and repaid on-chain.
- **ZK + Lending** — First protocol to combine private credit scoring with risk-based collateral on Aleo.
- **Complete lifecycle** — Income → Score → Borrow → Fund → Repay → Settle. Every step works end-to-end.
- **Production UI** — Multi-step transaction progress, dynamic dashboards, trust indicators. Built to look and feel like a real fintech product.
- **Single unified contract** — All logic in one program (`core_credaris.aleo`) using 5 encrypted record types and 13 public mappings.


## 📄 Contract Functions

| Function | Type | Description |
|----------|------|-------------|
| `attest_income` | Private → Public | Verify income, create encrypted proof |
| `compute_score` | Private → Public | Calculate credit score in ZK |
| `lock_collateral` | Public | Escrow ALEO via credits.aleo |
| `unlock_collateral` | Public | Withdraw unlocked collateral |
| `request_loan` | Private → Public | Submit hash-bound loan request |
| `cancel_request` | Private | Cancel unfilled request |
| `approve_loan` | Private → Public | Fund loan atomically |
| `repay_loan` | Private → Public | Repay and update agreement |
| `claim_default` | Private → Public | Claim collateral after default |


Built by [0xSambit](https://sambitsargam.in)
