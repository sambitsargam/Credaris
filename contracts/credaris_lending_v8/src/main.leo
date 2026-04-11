// credaris_lending_v8.aleo — Privacy-Preserving Lending Marketplace
//
// ARCHITECTURE:
//   Solves the Aleo UTXO record ownership constraint.
//   Lender NEVER consumes borrower's record.
//   Instead, borrower publishes a request_hash to a public mapping.
//   Lender references the hash to fund the loan on-chain.
//
// MARKETPLACE FLOW:
//   1. Borrower calls request_loan() → private LoanRequest record + public hash
//   2. Off-chain: request listed on marketplace (hash + credit tier visible)
//   3. ANY lender can select a request
//   4. Lender calls approve_loan(request_hash, borrower, terms...)
//   5. Contract verifies hash exists, checks credit tier, creates two LoanAgreements
//   6. Borrower repays privately via repay_loan()
//
// PRIVACY:
//   Private: amount, collateral, interest rate, repayment amounts, credit score
//   Public:  request_hash, loan status (active/closed), credit_tier (coarse)
//
// TRUST CHAIN: income_v3 → credit_v4 → lending_v8

import credaris_credit_v4.aleo;

program credaris_lending_v8.aleo {

    // ═══════════════════════════════════════════
    // RECORDS — All financial data private
    // ═══════════════════════════════════════════

    record LoanRequest {
        owner: address,
        borrower: address,
        amount: u64,
        duration: u32,
        collateral: u64,
        request_hash: field,
    }

    record LoanAgreement {
        owner: address,
        borrower: address,
        lender: address,
        principal: u64,
        interest_rate: u64,
        total_due: u64,
        amount_repaid: u64,
        due_by: u32,
        is_active: bool,
        loan_id: field,
    }

    record RepaymentReceipt {
        owner: address,
        borrower: address,
        amount_paid: u64,
        remaining: u64,
        loan_id: field,
    }

    // ═══════════════════════════════════════════
    // PUBLIC MAPPINGS — Non-financial only
    // ═══════════════════════════════════════════

    // Marketplace request registry
    mapping request_exists: field => bool;
    mapping request_borrower: field => address;
    mapping request_filled: field => bool;

    // Loan lifecycle state
    mapping loan_active: field => bool;
    mapping has_active_loan: address => bool;

    // ═══════════════════════════════════════════
    // PHASE 1: REQUEST — Borrower posts intent
    // Private record + public hash for marketplace discovery
    // ═══════════════════════════════════════════
    fn request_loan(
        amount: u64,
        duration: u32,
        collateral: u64,
        nonce: field,
    ) -> (LoanRequest, Final) {
        let borrower: address = self.signer;

        assert(amount > 0u64);
        assert(duration > 0u32);

        // Secure request hash: hash(amount || duration || collateral || nonce || borrower)
        // Nonce prevents brute-force / pattern analysis of the hash
        let packed: u128 = (amount as u128) * 10000000000u128
            + (duration as u128) * 1000000u128
            + (collateral as u128);
        let hash_input: field = BHP256::hash_to_field(packed)
            + nonce
            + BHP256::hash_to_field(borrower);
        let request_hash: field = BHP256::hash_to_field(hash_input);

        let request: LoanRequest = LoanRequest {
            owner: borrower,
            borrower: borrower,
            amount: amount,
            duration: duration,
            collateral: collateral,
            request_hash: request_hash,
        };

        return (request, final {
            // Credit eligibility — must have a computed tier
            let tier: u8 = credaris_credit_v4.aleo::credit_tier.get_or_use(borrower, 0u8);
            assert(tier > 0u8);

            // No double requests — cannot have existing active loan
            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            // Register request in marketplace
            Mapping::set(request_exists, request_hash, true);
            Mapping::set(request_borrower, request_hash, borrower);
            Mapping::set(request_filled, request_hash, false);
        });
    }

    // ═══════════════════════════════════════════
    // PHASE 1b: CANCEL — Borrower withdraws request
    // Only the borrower can consume their own record
    // ═══════════════════════════════════════════
    fn cancel_request(
        request: LoanRequest,
    ) -> Final {
        assert_eq(request.borrower, self.signer);

        let hash: field = request.request_hash;

        return final {
            Mapping::set(request_exists, hash, false);
            Mapping::set(request_filled, hash, true);
        };
    }

    // ═══════════════════════════════════════════
    // PHASE 2: APPROVE — ANY lender can fund a request
    // No record consumption from borrower!
    // Lender references the public request_hash instead.
    // Contract verifies: hash exists, not filled, borrower eligible
    // Creates dual LoanAgreement records (both parties receive one)
    // ═══════════════════════════════════════════
    fn approve_loan(
        request_hash: field,
        borrower: address,
        amount: u64,
        interest_rate: u64,
        duration: u32,
        nonce: field,
    ) -> (LoanAgreement, LoanAgreement, Final) {
        let lender: address = self.signer;

        // Self-lending blocked
        assert_neq(lender, borrower);

        assert(amount > 0u64);
        assert(interest_rate > 0u64);
        assert(interest_rate <= 5000u64);
        assert(duration > 0u32);

        // Compute loan terms
        let interest: u64 = (amount * interest_rate) / 10000u64;
        let total: u64 = amount + interest;

        // Strong loan ID: hash(request_hash || lender || nonce)
        let lid_input: field = request_hash
            + BHP256::hash_to_field(lender)
            + nonce;
        let loan_id: field = BHP256::hash_to_field(lid_input);

        // Dual records — both parties get a private copy
        let borrower_copy: LoanAgreement = LoanAgreement {
            owner: borrower,
            borrower: borrower,
            lender: lender,
            principal: amount,
            interest_rate: interest_rate,
            total_due: total,
            amount_repaid: 0u64,
            due_by: duration,
            is_active: true,
            loan_id: loan_id,
        };

        let lender_copy: LoanAgreement = LoanAgreement {
            owner: lender,
            borrower: borrower,
            lender: lender,
            principal: amount,
            interest_rate: interest_rate,
            total_due: total,
            amount_repaid: 0u64,
            due_by: duration,
            is_active: true,
            loan_id: loan_id,
        };

        return (borrower_copy, lender_copy, final {
            // Verify request exists and is active
            let exists: bool = Mapping::get_or_use(request_exists, request_hash, false);
            assert(exists);
            let filled: bool = Mapping::get_or_use(request_filled, request_hash, false);
            assert(!filled);

            // Verify borrower matches the request
            let req_borrower: address = Mapping::get(request_borrower, request_hash);
            assert_eq(req_borrower, borrower);

            // Verify credit eligibility via tier
            let tier: u8 = credaris_credit_v4.aleo::credit_tier.get_or_use(borrower, 0u8);
            assert(tier > 0u8);

            // No double loans
            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            // Mark request as filled and activate loan
            Mapping::set(request_filled, request_hash, true);
            Mapping::set(loan_active, loan_id, true);
            Mapping::set(has_active_loan, borrower, true);
        });
    }

    // ═══════════════════════════════════════════
    // PHASE 3: REPAY — Borrower repays privately
    // Amount explicitly private in ZK proof
    // ═══════════════════════════════════════════
    fn repay_loan(
        agreement: LoanAgreement,
        amount: u64,
    ) -> (LoanAgreement, RepaymentReceipt, Final) {
        // Only borrower can repay
        assert_eq(agreement.borrower, self.signer);
        assert(agreement.is_active);
        assert(amount > 0u64);

        let b: address = agreement.borrower;
        let remaining_before: u64 = agreement.total_due - agreement.amount_repaid;

        // No overpayment
        assert(amount <= remaining_before);

        let new_repaid: u64 = agreement.amount_repaid + amount;
        let new_remaining: u64 = remaining_before - amount;
        let still_active: bool = new_remaining > 0u64;
        let lid: field = agreement.loan_id;

        let updated: LoanAgreement = LoanAgreement {
            owner: b, borrower: b, lender: agreement.lender,
            principal: agreement.principal, interest_rate: agreement.interest_rate,
            total_due: agreement.total_due, amount_repaid: new_repaid,
            due_by: agreement.due_by, is_active: still_active, loan_id: lid,
        };

        let receipt: RepaymentReceipt = RepaymentReceipt {
            owner: b, borrower: b,
            amount_paid: amount, remaining: new_remaining, loan_id: lid,
        };

        return (updated, receipt, final {
            if !still_active {
                Mapping::set(loan_active, lid, false);
                Mapping::set(has_active_loan, b, false);
            }
        });
    }

    @noupgrade
    constructor() {}
}
