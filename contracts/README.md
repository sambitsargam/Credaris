# Credaris Smart Contracts

Privacy-preserving financial identity and credit layer on Aleo.

## Deployment Status (Testnet) — All Deployed ✅

| Program | Status | Transaction ID |
|---|---|---|
| `credaris_income_v3.aleo` | ✅ Deployed | `at12e47s9c4cy0qsfmmkknjruarxjhj7y7wf6hwdfr8a9z6cglvlqgqf6phdj` |
| `credaris_credit_v2.aleo` | ✅ Deployed | `at15aqhhzg4ykpe6er07jw5wkturnrryk2f6m9fm44p0asn8nlczvyqls0tpr` |
| `credaris_lending_v2.aleo` | ✅ Deployed | `at1jpscrzzw5yfgcnles87qhvhe58qtmguscga0yd9j2x8vlugclv9q9hqdsp` |

**Deployer Address:** `aleo104ek2nupdmlxjt795zs5c72e2z25e9yslmjl2z57fd4xx87phqpqnzak65`

## Privacy Architecture

### ❌ Previous (v1/v2) — REMOVED
```
mapping verified_incomes: address => u64   ← LEAKED raw income
mapping credit_scores: address => u64      ← LEAKED raw score
mapping active_loans: field => u64         ← LEAKED loan amounts
mapping total_repaid: address => u64       ← LEAKED repayment data
```

### ✅ Current (v3/v2) — PRIVACY-PRESERVING
```
mapping income_commitments: address => field   ← BHP256 hash only
mapping score_commitments: address => field     ← BHP256 hash only
mapping has_score: address => bool              ← Boolean flag only
mapping loan_active: field => bool              ← Status only
mapping has_active_loan: address => bool        ← Boolean flag only
```

### Trust Chain (Cross-Program Verification)
```
credaris_income_v3.aleo
    → Stores income commitment hash
    → credaris_credit_v2.aleo READS income_commitments
      → Verifies income data matches commitment
      → Stores score commitment hash
      → credaris_lending_v2.aleo READS has_score
        → Verifies borrower has computed credit score
        → Only boolean loan status stored publicly
```

## Build Status

All 3 contracts compile with Leo 4.0.0:

```
✅ credaris_income_v3.aleo  — 26 statements, 1.47 KB
✅ credaris_credit_v2.aleo  — 63 statements, 2.45 KB (depends on income_v3)
✅ credaris_lending_v2.aleo — 81 statements, 3.95 KB (depends on credit_v2)
```

---

## Programs

### credaris_income_v3.aleo
Privacy-preserving income attestation with commitment proofs.

**Records:** `IncomeProof` (owner, total_income, tx_count, avg_income, period_start, period_end, verified)

**Mappings:**
- `income_commitments: address => field` (BHP256 hash of income data)
- `attestation_count: address => u64` (non-sensitive count)

**Functions:**
- `attest_income` — validates inputs, creates private proof, stores commitment hash (NOT raw income)

**ZK Guarantees:**
- `avg_income == total_income / tx_count` enforced by ZK circuit
- Only commitment hash reaches finalize — raw income stays private

---

### credaris_credit_v2.aleo
ZK credit scoring with cross-program income verification.

**Dependencies:** `credaris_income_v3.aleo`

**Records:** `CreditReport` (owner, score, income_factor, repayment_factor, penalty, computed_at)

**Mappings:**
- `score_commitments: address => field` (hash of score)
- `has_score: address => bool` (eligibility flag)
- `score_history_count: address => u64`

**Functions:**
- `compute_score` — reads `income_commitments` from income contract to verify data integrity. Score computed in ZK, stored as commitment.

**Trust Model:**
- Finalize reads `credaris_income_v3.aleo::income_commitments[address]`
- Asserts commitment matches user inputs — prevents fake income injection

---

### credaris_lending_v2.aleo
Privacy-preserving lending with credit eligibility verification.

**Dependencies:** `credaris_credit_v2.aleo`

**Records:** `LoanRequest`, `LoanAgreement`, `RepaymentReceipt`

**Mappings:**
- `loan_active: field => bool` (status only — no amounts)
- `has_active_loan: address => bool` (existence flag)

**Functions:**
- `request_loan` — verifies `has_score` from credit contract, creates private loan request
- `approve_loan` — lender approves, creates dual agreements, prevents self-lending
- `repay_loan` — handles repayment, auto-closes on full payment. All amounts in private records.

**Security:**
- No financial amounts in public mappings
- Self-lending prevented (`lender ≠ borrower`)
- Overpayment prevented (`amount ≤ remaining`)
- Credit score required for loan requests

---

## Build & Deploy

```bash
# Prerequisites
cargo install leo-lang

# Build all (order matters — dependencies first)
cd contracts/credaris_income_v3 && leo build
cd ../credaris_credit_v2 && leo build
cd ../credaris_lending_v2 && leo build

# Deploy (order matters — dependencies first)
cd contracts/credaris_income_v3 && leo deploy --yes --broadcast
cd ../credaris_credit_v2 && leo deploy --yes --broadcast
cd ../credaris_lending_v2 && leo deploy --yes --broadcast
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
│   ├── credaris_income_v3/    (income attestation + commitment)
│   ├── credaris_credit_v2/    (ZK credit scoring + income verification)
│   └── credaris_lending_v2/   (lending lifecycle + score eligibility)
└── frontend/
    └── src/
        ├── App.jsx            (wallet adapter setup)
        ├── pages/             (Landing, Dashboard, Income, Credit, Lending, Docs)
        ├── components/        (CreditGauge)
        └── services/          (API, income analyzer)
```
