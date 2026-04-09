# Credaris Smart Contracts

Privacy-preserving financial identity and credit layer on Aleo.

## Deployment Status (Testnet) — All Deployed ✅

| Program | Status | Transaction ID |
|---|---|---|
| `credaris_income_v1.aleo` | ✅ Deployed | `at1ft0qtxe54zysmaf39dvptrql5egn765mhxxft5wcw8tyalqghq9qeghylq` |
| `credaris_credit_v1.aleo` | ✅ Deployed | `at13gy3q075nmkw2vugk9yp57u9m3xguw3hvgjdulwk6k0396xxe5gqe3kfzc` |
| `credaris_lending_v1.aleo` | ✅ Deployed | `at14cu94sa2ez2hfdsx3au7advt6wjw4a4q0dy3kkqqmkk9ru0sycpqse7hxj` |

**Deployer Address:** `aleo104ek2nupdmlxjt795zs5c72e2z25e9yslmjl2z57fd4xx87phqpqnzak65`

## Build Status

All 3 contracts compile with Leo 4.0.0:

```
✅ credaris_income_v1.aleo  — 40 statements, 1.93 KB
✅ credaris_credit_v1.aleo  — 67 statements, 2.44 KB
✅ credaris_lending_v1.aleo — 91 statements, 4.26 KB
```

---

## Programs

### credaris_income_v1.aleo
Verifiable income proof attestation from on-chain transaction data.

**Records:** `IncomeProof` (owner, total_income, tx_count, avg_income, period_start, period_end, verified)

**Mappings:**
- `verified_incomes: address => u64`
- `attestation_count: address => u64`

**Functions:**
- `attest_income` — validates inputs, creates private proof, updates on-chain state
- `publish_income_hash` — owner-only selective disclosure

---

### credaris_credit_v1.aleo
Zero-knowledge credit score computation (300–850 scale).

**Records:** `CreditReport` (owner, score, income_factor, repayment_factor, penalty, computed_at)

**Mappings:** `credit_scores`, `score_history_count`

**Functions:**
- `compute_score` — computes from income + repayment data, clamps [300, 850]
- `publish_score` — owner-only disclosure to public mapping

---

### credaris_lending_v1.aleo
Complete loan lifecycle: request → approve → repay.

**Records:** `LoanRequest`, `LoanAgreement`, `RepaymentReceipt`

**Mappings:** `active_loans`, `loan_count`, `total_repaid`, `repayment_count`

**Functions:**
- `request_loan` — borrower creates loan request (max 1B, max 50% rate)
- `approve_loan` — lender approves, no self-lending, creates dual records
- `repay_loan` — borrower repays, auto-closes on full repayment

---

## Build & Deploy

```bash
# Prerequisites
cargo install leo-lang

# Build all
cd contracts/credaris_income_v1 && leo build
cd ../credaris_credit_v1 && leo build
cd ../credaris_lending_v1 && leo build

# Deploy
leo deploy --network testnet --endpoint https://api.explorer.provable.com/v1 --priority-fees 100000 --yes --broadcast
```

## Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

Uses `@provablehq/aleo-wallet-adaptor-*` for wallet connection per official documentation.

## Architecture

```
Credaris/
├── contracts/
│   ├── credaris_income_v1/    (income attestation)
│   ├── credaris_credit_v1/    (credit scoring)
│   └── credaris_lending_v1/   (lending lifecycle)
└── frontend/
    └── src/
        ├── App.jsx            (wallet adapter setup)
        ├── pages/             (Landing, Dashboard, Income, Credit, Lending)
        ├── components/        (CreditGauge)
        └── services/          (API, income analyzer)
```
