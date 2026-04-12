# Credaris Protocol — On-Chain Contracts

Credaris is a privacy-preserving financial identity and lending protocol built on the Aleo blockchain using the Leo programming language. All logic is implemented as zero-knowledge programs.

---

## Deployed Contracts

| Contract | Program ID | TX ID | Explorer |
|---|---|---|---|
| Core Protocol | `credaris_core_v8.aleo` | `at1rmma2t5ejaqw5c7k2ggud46t2hxunfesspqqnyjsh3q4y2kf55xqu0mp8x` | [View ↗](https://testnet.explorer.provable.com/program/credaris_core_v8.aleo) |

- **Network:** Aleo Testnet  
- **Deployer:** `aleo1f2v089897ash8qg4f43rkyxfnc5cpx0sn3p0mn5z8x45c7pzkgpswy40pv`  
- **Leo Version:** 4.0.0  

---

## Architecture

```
credaris_core_v8.aleo          — Main protocol logic
  ├── attest_income()       — Income verification → IncomeProof record
  ├── compute_score()       — ZK credit scoring → CreditReport record
  ├── lock_collateral()     — Register collateral lock (ALEO sent separately)
  ├── unlock_collateral()   — Release collateral mapping (ALEO returned separately)
  ├── request_loan()        — Borrower creates → LoanRequest record
  ├── cancel_request()      — Borrower cancels a pending request
  ├── approve_loan()        — Lender funds → two LoanAgreement records
  ├── repay_loan()          — Borrower repays → updated LoanAgreement + RepaymentReceipt
  └── claim_default()       — Lender seizes collateral after missed deadline
```

### Protocol Design (Leo 4.0 Safe)

Leo 4.0 unifies transitions under the `fn` and `final` pattern. Credaris V8 uses an **Atomic Token Escrow** model:
- **Atomic PULL (Signer → Escrow)**: `lock_collateral`, `repay_loan`. The contract uses `transfer_public_as_signer` to pull funds directly from the user's wallet into the contract's secure escrow.
- **Atomic PULL to Other**: `repay_loan` pulls from borrower and sends to lender in one atomic transition.
- **Trustless PUSH (Escrow → Signer)**: `unlock_collateral`, `claim_default`. The contract uses `transfer_public` to release escrowed funds.
- **Data Binding**: High-fidelity ZK identity. Credit scores are cryptographically pinned to on-chain income proofs.

---

## credaris_core_v8.aleo — Full Reference

### Records

| Record | Owner | Description |
|---|---|---|
| `IncomeProof` | borrower | Private income attestation with total, count, avg, period |
| `CreditReport` | borrower | ZK credit score with tier, factors, and penalty |
| `LoanRequest` | borrower | Pending loan request with BHP256 tamper-proof hash |
| `LoanAgreement` | borrower or lender | Active loan terms with repayment tracking |
| `RepaymentReceipt` | borrower | Receipt for each partial repayment |

### Mappings

| Mapping | Key | Value | Description |
|---|---|---|---|
| `income_commitments` | address | field | BHP256 commitment of last income proof |
| `attestation_count` | address | u64 | Number of income attestations |
| `credit_tier` | address | u8 | 1=Excellent, 2=Good, 3=Fair, 4=Poor |
| `has_score` | address | bool | Whether a score exists |
| `locked_collateral` | address | u64 | Tracked collateral amount (microcredits) |
| `loan_collateral` | field (loan_id) | u64 | Per-loan collateral amount |
| `request_exists` | field (hash) | bool | Whether a loan request is live |
| `request_borrower` | field (hash) | address | Who made the request |
| `request_filled` | field (hash) | bool | Whether the request was funded |
| `loan_active` | field (loan_id) | bool | Whether a loan is active |
| `has_active_loan` | address | bool | Whether the borrower has an open loan |
| `total_repaid` | address | u64 | Cumulative repayment amount |
| `repayment_count` | address | u64 | Number of repayments made |
| `missed_payments` | address | u64 | Number of defaults |

### Credit Tier System

| Tier | Score Range | Min Collateral | Description |
|---|---|---|---|
| 1 — Excellent | 750-850 | 10% of loan | Lowest risk, best rates |
| 2 — Good | 650-749 | 25% of loan | Standard terms |
| 3 — Fair | 500-649 | 40% of loan | Higher deposit required |
| 4 — Poor | 300-499 | 200% of loan | Can borrow up to 50% of collateral |

### Safety Constraints

- `assert_neq(lender, borrower)` — no self-funding
- `interest_rate <= 5000` — max 50% APR (5000 basis points)
- `amount <= remaining` — no overpayment
- BHP256 hash verified on-chain — tamper-proof loan parameters
- All records owner-gated by `self.signer`
- **State checks before execution**: Contracts strictly check internal mappings (like `locked_collateral >= collateral`) during `approve_loan` to ensure accounting lines up perfectly with external transfers.

---

## Flow Examples

### Lock Collateral (Atomic Pull)

```
1. Frontend executes: credaris_core_v8.aleo/lock_collateral(amount)
   → Internally calls credits.aleo/transfer_public_as_signer(contract_address, amount)
   → ALEO physically moves from user wallet → contract escrow
   → locked_collateral[caller] += amount (all atomic, all-or-nothing)
```

### Approve Loan (Atomic Funding)

```
1. Frontend executes: credaris_core_v8.aleo/approve_loan(...)
   → Internally calls credits.aleo/transfer_public(borrower, amount)
   → ALEO physically moves from contract → borrower wallet
   → Enforces locked_collateral >= loan_req_collateral
   → Creates LoanAgreement records and locks state (all atomic)
```

---

## Building Locally

```bash
# Install Leo
curl -L https://install.provable.tools/leo | sh

# Build core
cd contracts/credaris_core_v8
leo build
```

## Deployment

```bash
# Set private key in .env
echo "PRIVATE_KEY=APrivateKey1..." > .env

# Deploy (costs ~19.6 credits for core)
leo deploy --network testnet --endpoint https://api.explorer.provable.com/v1 --broadcast --yes
```

---

## License

MIT
