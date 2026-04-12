# 🛡️ Credaris Core Protocol

Credaris is a high-performance, privacy-preserving lending protocol built on **Aleo**. It leverages zero-knowledge proofs to enable trustless financial identity and decentralized credit markets without exposing sensitive user data.

## 🚀 Live Deployment Information

| Parameter | Value |
| :--- | :--- |
| **Program ID** | `core_credaris.aleo` |
| **Network** | Aleo Testnet |
| **Deployment TX** | `at16mzzlkskr0wxsvf6jla5dwauzpkw4y05zs7xh53fj4uyga20x5qqwuyrp2` |
| **Deployer** | `aleo1f2v089897ash8qg4f43rkyxfnc5cpx0sn3p0mn5z8x45c7pzkgpswy40pv` |
| **Compiler** | Leo 4.0.0 |
| **Explorer** | [View on Aleo Explorer ↗](https://testnet.explorer.provable.com/program/core_credaris.aleo) |

## 🏛️ Architecture Overview

The `core_credaris.aleo` contract acts as a unified engine for the entire lending lifecycle. It manages identity, risk, and capital flows in a single atomic environment.

### 1. Identity & Scoring
*   `attest_income()`: Generates a private `IncomeProof` record based on verified transaction history.
*   `compute_score()`: **[Hardened]** Computes a ZK credit score. Requires significant economic volume (scaled to 1,000+ ALEO historic volume) for top-tier ratings.

### 2. Capital Management (The Atomic Escrow)
Credaris uses a **"Pull-Push" Escrow Model** to ensure 100% solvency:
*   `lock_collateral()`: **Atomic Pull**. Moves ALEO from user wallet directly into the contract's secure vault.
*   `unlock_collateral()`: **Trustless Push**. Releases unused collateral back to the user.

### 3. Lending Lifecycle
*   `request_loan()`: Borrower commits collateral and posts a hashed request.
*   `approve_loan()`: Lender fills a request. Capital moves atomically from contract to borrower.
*   `repay_loan()`: **[Revenue Split]** Borrower repays. Logic atomically splits 2.5% to the protocol treasury and 97.5% to the lender.
*   `claim_default()`: Lender captures collateral if the borrower misses the deadline.

## 🔐 Deep Dive: Collateral Lifecycle

Collateral in Credaris is never just a "number"—it is physically secured ALEO credits held within the protocol program.

1.  **Locking**: Users call `lock_collateral(amount)`. This uses `transfer_public_as_signer` to pull ALEO from the user's wallet into the `core_credaris.aleo` address. The mapping `locked_collateral` tracks this balance.
2.  **Commitment**: When requesting a loan via `request_loan()`, the required amount is deducted from `locked_collateral` and moved into `request_collateral`. It is now "jailed" and cannot be withdrawn.
3.  **Bonding**: Once a lender approves, the funds move into `loan_collateral`, permanently tied to that specific `loan_id`.
4.  **Recapture**: Upon full repayment, the system automatically returns the balance from `loan_collateral` to the borrower's `locked_collateral` pool, making it available for new loans or withdrawal.

## 💳 Repayment & Revenue Distribution

Credaris features a highly efficient, automated revenue model that ensures both lenders and the protocol are paid instantly and fairly.

### The 2.5% Protocol Fee
Every repayment made by a borrower is automatically subjected to a **2.5% service fee**. This fee supports the continuous development and security of the Credaris ecosystem.

### Atomic Multi-Routing
Unlike traditional platforms that wait for "claims" or "withdrawals," Credaris uses **Atomic Batching** to distribute funds. When a borrower calls `repay_loan(amount)`:
*   The contract calculates the **Protocol Cut** (2.5%) and the **Lender Share** (97.5%).
*   It issues **two simultaneous transfer calls** in a single transaction.
*   **Result**: The borrower’s wallet is debited once, the Lender receives 97.5% in their wallet, and the Treasury receives 2.5% in its wallet—all at the same exact block height.

**Treasury Address**: `aleo16jqhraylf6vqwxks2wv5827rkyn55kre7x3w8mvh8gr4c4ajggqsd2s7jh`

## 📊 Technical Reference

### Public State (Mappings)

| Name | Description |
| :--- | :--- |
| `credit_tier` | Stores the derived risk profile (1-4) of an address. |
| `locked_collateral` | Real-time ledger of ALEO held in escrow for each user. |
| `loan_active` | Boolean toggle for individual loan IDs to prevent double-spending/repayment. |
| `total_repaid` | Cumulative repayment volume per borrower (On-chain reputation). |
| `missed_payments` | Counter for defaults, used as a heavy penalty in future score computations. |

### Data Structures (Records)

| Record | Usage |
| :--- | :--- |
| `IncomeProof` | Private proof of earning power. |
| `CreditReport` | Private score used to unlock better LTV ratios. |
| `LoanAgreement` | The "Debt NFT". Represents an active obligation between two parties. |
| `RepaymentReceipt` | Proof of partial or full settlement. |

## ⚙️ Development

### Build
```bash
cd contracts/core_credaris
leo build
```

### Test
```bash
# Example: Simulating a score computation
leo run compute_score <address> <income> <tx_count> <avg> <repaid> <missed> <block>
```

## ⚖️ License
This project is licensed under the MIT License.
