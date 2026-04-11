import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

const SECTIONS = [
  {
    id: 'overview',
    title: 'Overview',
    content: [
      {
        heading: 'What is Credaris?',
        body: `Credaris is a privacy-preserving financial identity and credit layer built on the Aleo blockchain. Unlike traditional DeFi lending protocols, Credaris is not a generic swap-and-lend platform — it is an identity + trust layer for finance.

It enables three core primitives:
• Verifiable income proof using real on-chain transaction data
• Zero-knowledge credit scoring with deterministic algorithms
• Decentralized lending backed by provable financial history

Every piece of financial data — income proofs, credit reports, loan agreements — is stored as an encrypted Aleo record. Only the record owner can decrypt and view their data. Verifiers can confirm proofs without seeing the underlying numbers.`
      },
      {
        heading: 'Deployed Programs',
        body: `Three independent Leo programs are deployed on Aleo Testnet:

┌─────────────────────────┬──────────────────────────────────────┐
│ Program                 │ Purpose                              │
├─────────────────────────┼──────────────────────────────────────┤
│ credaris_income_v3.aleo │ Income verification & attestation    │
│ credaris_credit_v4.aleo │ Deterministic ZK credit scoring      │
│ credaris_lending_v9.aleo│ Decentralized lending protocol       │
└─────────────────────────┴──────────────────────────────────────┘

Each program is independently deployed and interacts through public mappings. The frontend aggregates data from all three to provide a unified financial identity dashboard.

Explorer Links:
• https://testnet.explorer.provable.com/program/credaris_income_v3.aleo
• https://testnet.explorer.provable.com/program/credaris_credit_v4.aleo
• https://testnet.explorer.provable.com/program/credaris_lending_v9.aleo`
      },
    ],
  },
  {
    id: 'tokens',
    title: 'Token Support',
    content: [
      {
        heading: 'Triple Token Architecture',
        body: `Credaris supports three tokens for lending, collateral, and income tracking:

ALEO (Native Credits)
━━━━━━━━━━━━━━━━━━━━
• Native gas token for the Aleo blockchain
• Primary denomination for income verification
• All income scans target credits.aleo/transfer_public transactions
• Used for transaction fees (typically 500,000 microcredits = 0.5 ALEO)
• Denominated in microcredits (1 ALEO = 1,000,000 microcredits)

USDCx (Synthetic USD Stablecoin)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Synthetic USD-pegged stablecoin on Aleo
• Provides stable-value lending pools without ALEO volatility risk
• Loans can be denominated in USDCx for predictable repayment amounts
• Uses the same privacy model as native ALEO records
• Ideal for borrowers who want fixed-value obligations

USAD (Algorithmic Stablecoin)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Algorithmic stablecoin backed by Aleo ecosystem collateral
• Offers a decentralized alternative to USDCx
• Backed by over-collateralized ALEO positions
• Auto-liquidation mechanism for under-collateralized vaults
• Governance-controlled stability parameters`
      },
      {
        heading: 'Token Selection in Lending',
        body: `When requesting a loan, borrowers can specify which token denomination to use. The lending contract tracks balances per token type:

• loan_count mapping: tracks active loans per address (all tokens)
• total_repaid mapping: tracks cumulative repayments per address
• Each LoanAgreement record stores the token type used

Cross-token lending is supported — a borrower can have an ALEO-denominated income proof but request a USDCx loan, provided their credit score meets the threshold.`
      },
    ],
  },
  {
    id: 'income',
    title: 'Income Verification',
    content: [
      {
        heading: 'How Income Verification Works',
        body: `The income verification flow scans real on-chain credit transfers received by your address. This is not mock data — it queries the Provable Explorer API v2 for actual transaction history.

Step-by-step flow:

1. CONNECT WALLET
   → User connects Shield or Leo wallet
   → Frontend reads the connected address

2. SCAN TRANSACTIONS
   → API call: GET /v2/testnet/transactions/address/{address}
   → Filters for credits.aleo transactions
   → Identifies transfer_public calls where user is the recipient
   → Parses the 'outputs' array for microcredit amounts

3. COMPUTE METRICS
   → total_income: sum of all incoming transfer amounts
   → tx_count: number of qualifying transactions
   → avg_income: total_income / tx_count
   → from_block: earliest block with income
   → to_block: latest block with income

4. GENERATE PROOF
   → Calls credaris_income_v3.aleo/attest_income transition
   → Inputs: total_income, tx_count, avg_income, from_block, to_block
   → Transaction fee: 500,000 microcredits
   → privateFee: false (required for Shield Wallet compatibility)

5. ON-CHAIN RESULT
   → Returns: IncomeProof private record (encrypted, only owner can read)
   → Finalize: updates verified_incomes[address] = total_income`
      },
      {
        heading: 'IncomeProof Record Structure',
        body: `record IncomeProof {
    owner: address,
    total_income: u64,
    tx_count: u64,
    avg_income: u64,
    from_block: u32,
    to_block: u32,
}

Fields:
• owner — the address that owns this proof (set to self.signer)
• total_income — cumulative microcredits received (e.g., 5000000 = 5.0 ALEO)
• tx_count — number of incoming transactions analyzed
• avg_income — average microcredits per transaction
• from_block — starting block height of the analysis window
• to_block — ending block height of the analysis window

The record is private — only the owner can decrypt it with their view key. The public mapping verified_incomes stores only the total_income value keyed by address, allowing other contracts to verify income without seeing the full proof.`
      },
      {
        heading: 'API Endpoint Details',
        body: `The income analyzer uses the Provable Explorer API v2:

Base URL: https://api.explorer.provable.com/v2/testnet

Endpoints used:
• GET /v2/testnet/transactions/address/{address}
  → Returns flat array of transaction objects
  → Each object has: id, type, status, block, transitions[]

• GET /v2/testnet/latest/height
  → Returns current block height as integer

Transaction filtering logic:
1. Filter for status === 'accepted'
2. Look for transitions where program === 'credits.aleo'
3. Check function === 'transfer_public' or 'transfer_private_to_public'
4. Parse outputs to find the recipient address and amount
5. Sum amounts where recipient === connected wallet address`
      },
    ],
  },
  {
    id: 'credit',
    title: 'Credit Scoring',
    content: [
      {
        heading: 'Deterministic Score Computation',
        body: `Credit scores in Credaris are computed entirely from on-chain data using a deterministic algorithm. There are no oracles, no external credit bureaus, and no off-chain data feeds. The same inputs always produce the same score.

Input sources:
• credaris_income_v3.aleo → verified_incomes mapping (total income)
• credaris_lending_v9.aleo → loan_count mapping (active loans)
• credaris_lending_v9.aleo → repayment_count mapping (successful repayments)
• credaris_lending_v9.aleo → total_repaid mapping (cumulative repayment amount)

Score algorithm (compute_score transition):

  base_score = 300

  // Income frequency bonus (0-200 points)
  if tx_count >= 20: +200
  else if tx_count >= 10: +150
  else if tx_count >= 5: +100
  else if tx_count >= 1: +50

  // Average income bonus (0-150 points)
  if avg_income >= 10_000_000: +150  (≥10 ALEO avg)
  else if avg_income >= 5_000_000: +100
  else if avg_income >= 1_000_000: +75
  else if avg_income >= 100_000: +25

  // Repayment history bonus (0-200 points)
  if repayment_count >= 10: +200
  else if repayment_count >= 5: +150
  else if repayment_count >= 1: +100

  // Missed payment penalty
  penalty = missed_payments * 50

  final_score = clamp(base_score + bonuses - penalty, 300, 850)

Score ranges:
• 750-850: Excellent — lowest interest rates, highest loan limits
• 650-749: Good — standard rates and limits
• 500-649: Fair — higher rates, lower limits
• 300-499: Poor — limited lending access`
      },
      {
        heading: 'CreditReport Record Structure',
        body: `record CreditReport {
    owner: address,
    score: u64,
    income_total: u64,
    income_count: u64,
    repayment_count: u64,
    missed_payments: u64,
    computed_at: u32,
}

Fields:
• score — the computed credit score (300-850)
• income_total — total verified income from the income contract
• income_count — number of income transactions
• repayment_count — number of successful loan repayments
• missed_payments — number of missed or defaulted payments
• computed_at — block height when the score was computed

Public mapping: credit_scores[address] = score
This allows the lending contract to check a borrower's score before approving a loan.`
      },
    ],
  },
  {
    id: 'lending',
    title: 'Lending Protocol',
    content: [
      {
        heading: 'Loan Lifecycle',
        body: `The lending protocol implements a complete loan lifecycle with on-chain enforcement of rules. Every constraint is checked in the Leo contract — they cannot be bypassed.

PHASE 1: REQUEST
━━━━━━━━━━━━━━━━
transition request_loan(amount: u64, interest_rate: u64, duration: u32) -> LoanRequest
• Borrower specifies loan amount, interest rate (basis points), and duration (blocks)
• Constraint: interest_rate <= 5000 (max 50%)
• Returns: LoanRequest private record (only borrower can see)
• No state changes — this is just a request, not a commitment

PHASE 2: APPROVE
━━━━━━━━━━━━━━━━
transition approve_loan(request: LoanRequest) -> (LoanAgreement, LoanAgreement)
• Lender reviews and approves a loan request
• Constraint: lender != borrower (self-lending is blocked)
• Returns: TWO LoanAgreement records — one for borrower, one for lender
• Finalize: loan_count[borrower] += 1

PHASE 3: REPAY
━━━━━━━━━━━━━━
transition repay_loan(loan: LoanAgreement, amount: u64) -> LoanAgreement
• Borrower makes a payment (partial or full)
• Constraint: amount <= remaining_balance (overpayment blocked)
• Returns: Updated LoanAgreement with new remaining balance
• Finalize: total_repaid[borrower] += amount, repayment_count[borrower] += 1
• If remaining_balance == 0: loan auto-closes, loan_count[borrower] -= 1`
      },
      {
        heading: 'Record Structures',
        body: `record LoanRequest {
    owner: address,         // borrower
    amount: u64,            // loan amount in microcredits
    interest_rate: u64,     // basis points (100 = 1%)
    duration: u32,          // blocks until maturity
    requested_at: u32,      // block height of request
}

record LoanAgreement {
    owner: address,         // record holder (borrower or lender)
    borrower: address,      // borrower address
    lender: address,        // lender address
    principal: u64,         // original loan amount
    interest_rate: u64,     // agreed interest rate
    total_owed: u64,        // principal + interest
    total_paid: u64,        // amount repaid so far
    remaining: u64,         // total_owed - total_paid
    duration: u32,          // loan duration in blocks
    created_at: u32,        // block height of approval
    is_active: bool,        // false after full repayment
}`
      },
      {
        heading: 'On-Chain Mappings',
        body: `The lending contract maintains these public mappings (updated in finalize blocks):

mapping loan_count: address => u64;
  → Number of active loans for each borrower
  → Incremented on approve_loan, decremented on full repayment

mapping total_repaid: address => u64;
  → Cumulative amount repaid by each borrower (all loans combined)
  → Only increases — never decremented

mapping repayment_count: address => u64;
  → Number of individual repayment transactions made
  → Used by the credit scoring algorithm

These mappings are public and queryable via the Explorer API:
GET /v2/testnet/program/credaris_lending_v9.aleo/mapping/loan_count/{address}
GET /v2/testnet/program/credaris_lending_v9.aleo/mapping/total_repaid/{address}`
      },
      {
        heading: 'Safety Constraints',
        body: `The following rules are enforced at the contract level (Leo compiler verified):

1. NO SELF-LENDING
   assert(self.signer != request.owner);
   → A lender cannot approve their own loan request

2. BOUNDED INTEREST RATES
   assert(interest_rate <= 5000u64);
   → Maximum 50% interest rate (5000 basis points)

3. NO OVERPAYMENT
   assert(amount <= loan.remaining);
   → Cannot pay more than the remaining balance

4. AUTO-CLOSURE
   if remaining == 0u64 { loan.is_active = false; }
   → Loans automatically close when fully repaid

5. SIGNER VERIFICATION
   assert(self.signer == loan.owner);
   → Only the record owner can repay their own loan`
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy Model',
    content: [
      {
        heading: 'Privacy Architecture',
        body: `Credaris implements privacy at every layer of the stack:

LAYER 1: RECORD PRIVACY
━━━━━━━━━━━━━━━━━━━━━━━
All sensitive financial data is stored as Aleo records — encrypted on-chain objects that can only be decrypted by the owner's view key.

• IncomeProof → contains exact income amounts and sources
• CreditReport → contains score breakdown and payment history  
• LoanRequest → contains requested terms (not visible to other users)
• LoanAgreement → contains full loan terms (visible only to borrower + lender)

LAYER 2: EXECUTION PRIVACY
━━━━━━━━━━━━━━━━━━━━━━━━━
All transitions use self.signer for authorization. The Leo compiler enforces that records cannot be accessed in finalize blocks — this is a language-level guarantee, not a convention.

LAYER 3: SELECTIVE DISCLOSURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Public mappings store only aggregate values (total income, credit score, loan count). A verifier can check your creditworthiness without seeing:
• Individual transaction amounts
• Transfer history or counterparties
• Loan terms or repayment schedules
• Income frequency or patterns`
      },
      {
        heading: 'Transfer Privacy',
        body: `Credaris leverages Aleo's native transfer privacy model:

DEPOSITS (user → contract):
credits.aleo/transfer_private_to_public
→ Hides the sender's address
→ Public state only sees that funds arrived

PAYOUTS (contract → user):
credits.aleo/transfer_public_to_private
→ Hides the recipient's address
→ Public state only sees that funds left

RECORD OWNERSHIP:
→ Records have an 'owner' field set to the creator's address
→ Only the owner can decrypt the record with their view key
→ Transfer of ownership requires creating a new record

KEY INSIGHT:
The finalize block (public state) only updates mappings with aggregate numbers. The actual financial details stay in private records. A malicious observer watching the blockchain can see that "address X has a credit score of 750" but cannot see how that score was computed or what income data supports it.`
      },
    ],
  },
  {
    id: 'architecture',
    title: 'Architecture',
    content: [
      {
        heading: 'System Architecture',
        body: `┌───────────────────────────────────────────────────────────┐
│                      FRONTEND (React 19)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │Dashboard │  │ Income   │  │ Credit   │  │ Lending  │  │
│  │  Page    │  │  Page    │  │  Page    │  │  Page    │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │              │              │       │
│  ┌────┴──────────────┴──────────────┴──────────────┴────┐  │
│  │              Wallet Adapter (Shield / Leo)            │  │
│  └──────────────────────┬───────────────────────────────┘  │
└─────────────────────────┼─────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌──────────────┐ ┌────────────────┐
│credaris_income_v3│ │credaris_     │ │credaris_       │
│     .aleo       │ │credit_v1.aleo│ │lending_v1.aleo │
│                 │ │              │ │                │
│ attest_income() │ │compute_score │ │ request_loan() │
│                 │ │     ()       │ │ approve_loan() │
│ verified_incomes│ │credit_scores │ │ repay_loan()   │
│   [mapping]     │ │  [mapping]   │ │                │
└─────────────────┘ └──────────────┘ │ loan_count     │
                                     │ total_repaid   │
                                     │ repayment_count│
                                     │   [mappings]   │
                                     └────────────────┘
          │               │               │
          └───────────────┼───────────────┘
                          ▼
              ┌─────────────────────┐
              │   ALEO TESTNET      │
              │   Leo 4.0 Runtime   │
              │   ZK Proof Engine   │
              └─────────────────────┘`
      },
      {
        heading: 'Technology Stack',
        body: `Frontend:
• React 19 — UI framework
• Vite 6 — Build tool and dev server
• Vanilla CSS — Custom design system (no Tailwind)
• React Router v6 — Client-side routing

Wallet Integration:
• @provablehq/aleo-wallet-adaptor-react — React context provider
• @provablehq/aleo-wallet-adaptor-shield — Shield Wallet adapter
• @provablehq/aleo-wallet-adaptor-leo — Leo Wallet adapter
• @provablehq/aleo-wallet-adaptor-core — Core types (DecryptPermission, etc.)

Smart Contracts:
• Leo 4.0 — Zero-knowledge programming language
• Three independent .aleo programs
• Compiled to Aleo VM bytecode
• Deployed on Aleo Testnet

API Layer:
• Provable Explorer API v2 (https://api.explorer.provable.com/v2/testnet)
• RESTful endpoints for block height, mappings, transactions
• No authentication required for public read endpoints`
      },
      {
        heading: 'API Reference',
        body: `All API calls go to: https://api.explorer.provable.com/v2/testnet

GET /v2/testnet/latest/height
→ Returns: integer (current block height)
→ Example: 1234567

GET /v2/testnet/program/{programId}/mapping/{mappingName}/{key}
→ Returns: mapped value (e.g., "5000000u64")
→ Example: GET /v2/testnet/program/credaris_income_v3.aleo/mapping/verified_incomes/aleo1abc...
→ Returns: "5000000u64"

GET /v2/testnet/transactions/address/{address}
→ Returns: array of transaction objects
→ Each object includes: id, type, status, block, transitions[]
→ Transitions include: program, function, inputs[], outputs[]

Note: All mapping values are returned as strings with type suffixes (e.g., "5000000u64"). The frontend strips the suffix and parses to integer.`
      },
    ],
  },
  {
    id: 'wallet',
    title: 'Wallet Guide',
    content: [
      {
        heading: 'Supported Wallets',
        body: `Credaris supports two wallet adapters:

SHIELD WALLET (Recommended)
━━━━━━━━━━━━━━━━━━━━━━━━━━
• Delegated proving — ZK proofs generated server-side (~14 seconds)
• No local computation required
• Seamless UX — feels like a normal web app
• Proofs are generated by Provable's infrastructure
• All transactions use privateFee: false
• Best for users who prioritize UX over trustlessness

LEO WALLET
━━━━━━━━━━
• Browser extension wallet
• Proofs generated locally in-browser (slower, ~60-120 seconds)
• Fully trustless — no external proof generation
• Requires more computational resources
• Best for users who prioritize decentralization

Both wallets support:
• DecryptPermission.UponRequest — records decrypted only when needed
• AutoConnect — automatic reconnection on page reload
• Network switching — currently locked to Testnet`
      },
      {
        heading: 'Transaction Format',
        body: `All contract interactions follow this format:

const tx = await wallet.executeTransaction({
  program: 'credaris_income_v3.aleo',
  function: 'attest_income',
  inputs: [
    '5000000u64',     // total_income
    '10u64',          // tx_count
    '500000u64',      // avg_income
    '100000u32',      // from_block
    '200000u32',      // to_block
  ],
  fee: 500_000,       // 0.5 ALEO
  privateFee: false,  // required for Shield
});

Important notes:
• All numeric inputs must include type suffixes (u64, u32, etc.)
• Fee is in microcredits (500000 = 0.5 ALEO)
• privateFee must be false for Shield Wallet compatibility
• The transaction returns a transaction ID for status polling
• Status can be tracked via the Explorer API until accepted/rejected`
      },
      {
        heading: 'Error Handling',
        body: `Common wallet errors and their causes:

"User rejected the request"
→ User clicked Cancel in the wallet popup
→ Action: Show user-friendly message, allow retry

"Insufficient balance"
→ Not enough ALEO to cover transaction fee
→ Action: Direct user to testnet faucet

"Program not found"
→ The specified program ID doesn't exist on-chain
→ Action: Verify program name exactly matches deployed program

"Invalid input"
→ Input format doesn't match the transition signature
→ Action: Check type suffixes (u64, u32, address, etc.)

"Proof generation failed"
→ Shield Wallet's proving infrastructure is unavailable
→ Action: Retry after 30 seconds, or switch to Leo Wallet

All errors are caught in try/catch blocks and displayed as toast notifications in the UI.`
      },
    ],
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');
  const currentSection = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="docs-page">
      <header className="docs-topbar">
        <div className="docs-topbar-left">
          <NavLink to="/" className="topbar-brand">
            <img src="/logo.svg" alt="Credaris" className="topbar-logo" />
            <span className="topbar-wordmark">Credaris</span>
          </NavLink>
          <span className="docs-topbar-divider">/</span>
          <span className="docs-topbar-title">Documentation</span>
        </div>
        <div className="topbar-right">
          <NavLink to="/dashboard" className="btn btn-ghost btn-sm">← Back to App</NavLink>
        </div>
      </header>

      <div className="docs-shell">
        <nav className="docs-sidebar">
          <div className="sidebar-section-label" style={{ padding: '0 0 8px' }}>Sections</div>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`docs-sidebar-item${activeSection === s.id ? ' active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.title}
            </button>
          ))}
          <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid var(--border-subtle)' }}>
            <a href="https://testnet.explorer.provable.com/program/credaris_income_v3.aleo" target="_blank" rel="noopener noreferrer" className="docs-sidebar-item">
              Income Contract ↗
            </a>
            <a href="https://testnet.explorer.provable.com/program/credaris_credit_v4.aleo" target="_blank" rel="noopener noreferrer" className="docs-sidebar-item">
              Credit Contract ↗
            </a>
            <a href="https://testnet.explorer.provable.com/program/credaris_lending_v9.aleo" target="_blank" rel="noopener noreferrer" className="docs-sidebar-item">
              Lending Contract ↗
            </a>
          </div>
        </nav>

        <main className="docs-main">
          {currentSection && currentSection.content.map((block, i) => (
            <section key={i} className="docs-block">
              <h2 className="docs-block-title">{block.heading}</h2>
              <div className="docs-block-body">
                {block.body.split('\n\n').map((para, j) => {
                  if (para.startsWith('record ') || para.startsWith('mapping ') || para.startsWith('const ') || para.startsWith('transition ')) {
                    return <pre key={j} className="docs-code">{para}</pre>;
                  }
                  if (para.includes('┌') || para.includes('━') || para.includes('│') || para.includes('└') || para.includes('▼') || para.includes('→ Returns') || para.includes('GET /')) {
                    return <pre key={j} className="docs-code">{para}</pre>;
                  }
                  return <p key={j}>{para}</p>;
                })}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
