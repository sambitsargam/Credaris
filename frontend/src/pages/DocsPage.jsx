import React, { useState } from 'react';

const SECTIONS = [
  {
    id: 'overview',
    title: 'What is Credaris?',
    content: `Credaris is a privacy-preserving financial identity and credit layer built on the Aleo blockchain. It enables verifiable income proof using on-chain data, zero-knowledge credit scoring, and secure lending — all without exposing your financial data.

Three independent Leo programs are deployed on Aleo Testnet:
• credaris_income_v1.aleo — Income verification and attestation
• credaris_credit_v1.aleo — Deterministic ZK credit scoring
• credaris_lending_v1.aleo — Decentralized lending protocol

Total: 3 programs with multiple transitions, mappings, and private record types.`,
  },
  {
    id: 'tokens',
    title: 'Triple Token Support',
    content: `Credaris supports three tokens for lending and collateral:

ALEO — Native Aleo credits. Used for gas fees and primary lending denomination. All income verification scans credits.aleo transfer_public transactions.

USDCx — Synthetic USD-pegged stablecoin on Aleo. Provides stable-value lending pools without volatility risk. Each loan can specify USDCx as the denomination.

USAD — Algorithmic stablecoin backed by Aleo ecosystem collateral. Offers an alternative stable denomination for borrowers and lenders who prefer decentralized backing.

All three tokens use the same privacy model — positions are stored as encrypted Aleo records visible only to the holder.`,
  },
  {
    id: 'income',
    title: 'Income Verification',
    content: `The income verification flow scans on-chain credit transfers received by your address via the Provable Explorer API v2.

How it works:
1. Connect your Shield or Leo wallet
2. The frontend queries /v2/testnet/transactions/address/{your_address}
3. Filters for credits.aleo transfer_public transactions where you are the recipient
4. Computes: total income, transaction count, average per transaction, block range
5. Submits an attest_income transition to credaris_income_v1.aleo
6. Returns an IncomeProof private record + updates verified_incomes mapping

The IncomeProof record contains: owner, total_income (u64), tx_count (u64), avg_income (u64), from_block (u32), to_block (u32).

On-chain mappings updated in finalize: verified_incomes[address] = total_income.`,
  },
  {
    id: 'credit',
    title: 'Credit Scoring',
    content: `Credit scores are computed deterministically from on-chain data — no oracles, no external feeds.

Inputs aggregated from all three contracts:
• Income frequency and average (from credaris_income_v1.aleo)
• Total income amount (verified_incomes mapping)
• Repayment history (from credaris_lending_v1.aleo)
• Number of loans and repayments (loan_count, repayment_count mappings)

Score computation (compute_score transition):
• Base: 300 points
• Income frequency bonus: up to +200 points
• Average income bonus: up to +150 points
• Repayment history bonus: up to +200 points
• Missed payment penalty: -50 per miss
• Final score clamped to [300, 850]

Output: CreditReport private record + credit_scores[address] mapping update.`,
  },
  {
    id: 'lending',
    title: 'Lending Protocol',
    content: `The lending protocol enables decentralized borrowing and lending backed by verifiable credit data.

Loan lifecycle:
1. request_loan — Borrower requests a loan (amount, interest rate, duration in blocks)
   → Returns: LoanRequest private record
   → Constraint: interest_rate ≤ 5000 basis points (50%)

2. approve_loan — Lender approves the request
   → Returns: Two LoanAgreement records (one for borrower, one for lender)
   → Constraint: lender ≠ borrower (no self-lending)

3. repay_loan — Borrower repays (partial or full)
   → Updates: total_repaid, repayment_count mappings
   → Constraint: amount ≤ remaining balance (no overpayment)
   → On full repayment: loan auto-closes, loan_count decremented

All state modifications happen in finalize {} blocks. Records are private and encrypted.`,
  },
  {
    id: 'privacy',
    title: 'Privacy Model',
    content: `Every design decision in Credaris prioritizes user privacy:

Encrypted Records — Income proofs, credit reports, and loan agreements are stored as private Aleo records. Only the owner's view key can decrypt them.

Private Execution — All transitions use self.signer for authorization. Records cannot be read in finalize blocks — this is enforced by the Leo compiler.

Selective Disclosure — Share only the proof, not the underlying data. A verifier can confirm your credit score without seeing your income amounts, transfer history, or loan terms.

No Address Leaks — Finalize blocks only update mappings keyed by address. The actual financial data stays in private records.

Transfer Privacy — Deposits use transfer_private_to_public (hides sender). Payouts use transfer_public_to_private (hides recipient).`,
  },
  {
    id: 'architecture',
    title: 'Architecture',
    content: `Full-stack architecture:

Frontend: React 19, Vite 6, Vanilla CSS, Wallet Adapter
Wallet: Shield Wallet (delegated proving), Leo Wallet
Contracts: credaris_income_v1.aleo, credaris_credit_v1.aleo, credaris_lending_v1.aleo
API: Provable Explorer v2 (https://api.explorer.provable.com/v2/testnet)
Chain: Aleo Testnet, Leo 4.0, Final Blocks, ZK Proofs

API Endpoints Used:
• GET /v2/testnet/latest/height — Current block height
• GET /v2/testnet/program/{id}/mapping/{name}/{key} — Read mapping values
• GET /v2/testnet/transactions/address/{addr} — Transaction history

All contract interactions use privateFee: false for Shield Wallet compatibility.`,
  },
  {
    id: 'wallet',
    title: 'Wallet Integration',
    content: `Credaris integrates with Provable's wallet adapters:

Shield Wallet — Delegated proving wallet. ZK proofs are generated server-side (~14 seconds) instead of in-browser, dramatically improving UX. Recommended for most users.

Leo Wallet — Browser extension wallet for Aleo. Generates proofs locally (slower but fully trustless).

Both wallets support:
• DecryptPermission.UponRequest — Records are decrypted only when explicitly requested
• AutoConnect — Wallet reconnects automatically on page reload
• Transaction status polling — Frontend polls until transaction is accepted/rejected

All executeTransaction calls use:
{
  program: 'credaris_*.aleo',
  function: '...',
  inputs: [...],
  fee: 500000,
  privateFee: false,
}`,
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">Documentation</h1>
        <p className="page-desc">Technical reference for the Credaris protocol</p>
      </div>

      <div className="docs-layout">
        <nav className="docs-nav">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`docs-nav-item${activeSection === s.id ? ' active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div className="docs-content">
          {SECTIONS.filter(s => s.id === activeSection).map(s => (
            <div key={s.id} className="card">
              <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20, color: 'var(--text-0)' }}>{s.title}</h2>
              <div className="docs-body">
                {s.content.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
