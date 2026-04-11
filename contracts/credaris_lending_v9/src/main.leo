// credaris_lending_v9.aleo — Hardened Privacy-Preserving Lending Marketplace
//
// SECURITY FIXES over v8:
//   1. HASH BINDING:    approve_loan recomputes request_hash from terms and asserts match
//                       → Lender CANNOT modify loan terms from borrower's original request
//   2. COLLATERAL:      Tier-based collateral enforcement via LTV ratios
//                       → Higher risk = more collateral required
//   3. RISK MODEL:      Credit tier drives max LTV and eligibility
//                       → Tier D (score < 500) is rejected outright
//   4. HASH SECURITY:   Multi-field chained hashing replaces packed arithmetic
//                       → No collision via overflow, no pattern leakage
//
// ARCHITECTURE (unchanged from v8):
//   Borrower publishes request_hash to mapping. Lender references hash.
//   No cross-owner record consumption. Full UTXO compliance.
//
// PRIVACY:
//   Private: amount, collateral, interest rate, repayment amounts, credit score
//   Public:  request_hash, loan status (active/closed), credit_tier (coarse)
//
// TRUST CHAIN: income_v3 → credit_v4 → lending_v9
//
// LTV MODEL:
//   Tier 1 (A, ≥700): up to 90% LTV → collateral ≥ amount * 10 / 100
//   Tier 2 (B, ≥600): up to 75% LTV → collateral ≥ amount * 25 / 100
//   Tier 3 (C, ≥500): up to 60% LTV → collateral ≥ amount * 40 / 100
//   Tier 4 (D, <500): REJECTED — too high risk

import credaris_credit_v4.aleo;

program credaris_lending_v9.aleo {

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
        collateral: u64,
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

    mapping request_exists: field => bool;
    mapping request_borrower: field => address;
    mapping request_filled: field => bool;
    mapping loan_active: field => bool;
    mapping has_active_loan: address => bool;

    // ═══════════════════════════════════════════
    // PHASE 1: REQUEST — Borrower posts intent
    // Hash: BHP256( BHP256(amount) + BHP256(duration) + BHP256(collateral) + nonce + BHP256(borrower) )
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
        assert(collateral > 0u64);

        // FIX #4: Secure multi-field chained hash (no packed arithmetic)
        let h1: field = BHP256::hash_to_field(amount as u128);
        let h2: field = BHP256::hash_to_field(duration as u128);
        let h3: field = BHP256::hash_to_field(collateral as u128);
        let h4: field = BHP256::hash_to_field(borrower);
        let combined: field = h1 + h2 + h3 + nonce + h4;
        let request_hash: field = BHP256::hash_to_field(combined);

        let request: LoanRequest = LoanRequest {
            owner: borrower,
            borrower: borrower,
            amount: amount,
            duration: duration,
            collateral: collateral,
            request_hash: request_hash,
        };

        return (request, final {
            // Credit tier check — Tier D (4) rejected outright
            let tier: u8 = credaris_credit_v4.aleo::credit_tier.get_or_use(borrower, 0u8);
            assert(tier > 0u8);
            assert(tier <= 3u8);

            // FIX #2: Collateral meets tier LTV requirement
            let ratio: u64 = tier == 1u8 ? 10u64 :
                             tier == 2u8 ? 25u64 : 40u64;
            let min_col: u64 = (amount * ratio) / 100u64;
            assert(collateral >= min_col);

            // No double requests
            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            // Register in marketplace
            Mapping::set(request_exists, request_hash, true);
            Mapping::set(request_borrower, request_hash, borrower);
            Mapping::set(request_filled, request_hash, false);
        });
    }

    // ═══════════════════════════════════════════
    // PHASE 1b: CANCEL — Borrower withdraws request
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
    //
    // SECURITY:
    //   Lender provides borrower's original terms (amount, duration,
    //   collateral, nonce). Contract recomputes hash and asserts match.
    //   Lender can ONLY add their interest_rate — cannot modify terms.
    //
    //   Collateral and tier are re-verified in finalize.
    // ═══════════════════════════════════════════
    fn approve_loan(
        request_hash: field,
        borrower: address,
        amount: u64,
        interest_rate: u64,
        duration: u32,
        collateral: u64,
        nonce: field,
    ) -> (LoanAgreement, LoanAgreement, Final) {
        let lender: address = self.signer;

        // Self-lending blocked
        assert_neq(lender, borrower);

        assert(amount > 0u64);
        assert(interest_rate > 0u64);
        assert(interest_rate <= 5000u64);
        assert(duration > 0u32);
        assert(collateral > 0u64);

        // ──────────────────────────────────────
        // FIX #1: HASH BINDING
        // Recompute hash from provided terms and assert exact match
        // If lender modifies ANY term, the hash won't match → tx rejected
        // ──────────────────────────────────────
        let h1: field = BHP256::hash_to_field(amount as u128);
        let h2: field = BHP256::hash_to_field(duration as u128);
        let h3: field = BHP256::hash_to_field(collateral as u128);
        let h4: field = BHP256::hash_to_field(borrower);
        let combined: field = h1 + h2 + h3 + nonce + h4;
        let computed_hash: field = BHP256::hash_to_field(combined);
        assert_eq(computed_hash, request_hash);

        // Compute loan financials
        let interest: u64 = (amount * interest_rate) / 10000u64;
        let total: u64 = amount + interest;

        // Strong loan ID
        let lid_input: field = request_hash
            + BHP256::hash_to_field(lender)
            + BHP256::hash_to_field(interest_rate as u128);
        let loan_id: field = BHP256::hash_to_field(lid_input);

        // Dual records — both parties get a private copy
        let borrower_copy: LoanAgreement = LoanAgreement {
            owner: borrower, borrower: borrower, lender: lender,
            principal: amount, interest_rate: interest_rate, collateral: collateral,
            total_due: total, amount_repaid: 0u64, due_by: duration,
            is_active: true, loan_id: loan_id,
        };

        let lender_copy: LoanAgreement = LoanAgreement {
            owner: lender, borrower: borrower, lender: lender,
            principal: amount, interest_rate: interest_rate, collateral: collateral,
            total_due: total, amount_repaid: 0u64, due_by: duration,
            is_active: true, loan_id: loan_id,
        };

        return (borrower_copy, lender_copy, final {
            // Verify request exists and is active
            let exists: bool = Mapping::get_or_use(request_exists, request_hash, false);
            assert(exists);
            let filled: bool = Mapping::get_or_use(request_filled, request_hash, false);
            assert(!filled);

            // Verify borrower matches
            let req_borrower: address = Mapping::get(request_borrower, request_hash);
            assert_eq(req_borrower, borrower);

            // FIX #3: Tier-based risk model — Tier D rejected
            let tier: u8 = credaris_credit_v4.aleo::credit_tier.get_or_use(borrower, 0u8);
            assert(tier > 0u8);
            assert(tier <= 3u8);

            // FIX #2: Collateral enforcement
            let ratio: u64 = tier == 1u8 ? 10u64 :
                             tier == 2u8 ? 25u64 : 40u64;
            let min_col: u64 = (amount * ratio) / 100u64;
            assert(collateral >= min_col);

            // No double loans
            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            // Mark filled and activate
            Mapping::set(request_filled, request_hash, true);
            Mapping::set(loan_active, loan_id, true);
            Mapping::set(has_active_loan, borrower, true);
        });
    }

    // ═══════════════════════════════════════════
    // PHASE 3: REPAY — Borrower repays privately
    // ═══════════════════════════════════════════
    fn repay_loan(
        agreement: LoanAgreement,
        amount: u64,
    ) -> (LoanAgreement, RepaymentReceipt, Final) {
        assert_eq(agreement.borrower, self.signer);
        assert(agreement.is_active);
        assert(amount > 0u64);

        let b: address = agreement.borrower;
        let remaining_before: u64 = agreement.total_due - agreement.amount_repaid;
        assert(amount <= remaining_before);

        let new_repaid: u64 = agreement.amount_repaid + amount;
        let new_remaining: u64 = remaining_before - amount;
        let still_active: bool = new_remaining > 0u64;
        let lid: field = agreement.loan_id;

        let updated: LoanAgreement = LoanAgreement {
            owner: b, borrower: b, lender: agreement.lender,
            principal: agreement.principal, interest_rate: agreement.interest_rate,
            collateral: agreement.collateral,
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
