// credaris_lending_v10.aleo — UTXO Collateral Implementation
//
// FEATURES OVER v9:
//   1. Explicit `Collateral` records minted before request.
//   2. `request_loan` burns/absorbs `Collateral` input securely natively.
//   3. `approve_loan` strictly hashes LTV equivalents.
//   4. `repay_loan` unlocks newly minted `Collateral` recursively upon zeros.
//   5. `claim_default` introduced. Lenders consume `LoanAgreement` to sweep collateral locally upon breaches.
//
// TRUST CHAIN: income_v3 → credit_v4 → lending_v10

import credaris_credit_v4.aleo;

program credaris_lending_v10.aleo {

    // ═══════════════════════════════════════════
    // RECORDS
    // ═══════════════════════════════════════════

    record Collateral {
        owner: address,
        amount: u64,
        is_locked: bool,
    }

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
    // PUBLIC MAPPINGS
    // ═══════════════════════════════════════════

    mapping request_exists: field => bool;
    mapping request_borrower: field => address;
    mapping request_filled: field => bool;
    mapping loan_active: field => bool;
    mapping has_active_loan: address => bool;

    // ═══════════════════════════════════════════
    // 0. LOCK COLLATERAL
    // Emits locked collateral natively for consumption into requests
    // ═══════════════════════════════════════════

    fn lock_collateral(amount: u64) -> Collateral {
        assert(amount > 0u64);
        return Collateral {
            owner: self.signer,
            amount: amount,
            is_locked: true,
        };
    }

    // ═══════════════════════════════════════════
    // 1. REQUEST LOAN
    // Consumes borrower's `Collateral` natively preventing UTXO violation.
    // Hash output matches the `Collateral.amount`.
    // ═══════════════════════════════════════════

    fn request_loan(
        amount: u64,
        duration: u32,
        collateral_record: Collateral,
        nonce: field,
    ) -> (LoanRequest, Final) {
        let borrower: address = self.signer;

        // Verify Record Context
        assert_eq(collateral_record.owner, borrower);
        assert(collateral_record.is_locked);
        
        assert(amount > 0u64);
        assert(duration > 0u32);

        // Natively inline compute_request_hash
        let h1: field = BHP256::hash_to_field(amount as u128);
        let h2: field = BHP256::hash_to_field(duration as u128);
        let h3: field = BHP256::hash_to_field(collateral_record.amount as u128);
        let h4: field = BHP256::hash_to_field(borrower);
        let combined: field = h1 + h2 + h3 + nonce + h4;
        let request_hash: field = BHP256::hash_to_field(combined);

        let request: LoanRequest = LoanRequest {
            owner: borrower,
            borrower: borrower,
            amount: amount,
            duration: duration,
            collateral: collateral_record.amount,
            request_hash: request_hash,
        };

        let actual_col_amount: u64 = collateral_record.amount;

        return (request, final {
            let tier: u8 = credaris_credit_v4.aleo::credit_tier.get_or_use(borrower, 0u8);
            assert(tier > 0u8);
            assert(tier <= 3u8);

            // Natively inline min_collateral_for_tier
            let ratio: u64 = tier == 1u8 ? 10u64 :
                             tier == 2u8 ? 25u64 :
                             tier == 3u8 ? 40u64 : 100u64;
            let min_col: u64 = (amount * ratio) / 100u64;
            assert(actual_col_amount >= min_col);

            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            Mapping::set(request_exists, request_hash, true);
            Mapping::set(request_borrower, request_hash, borrower);
            Mapping::set(request_filled, request_hash, false);
        });
    }

    // ═══════════════════════════════════════════
    // 1b. CANCEL REQUEST
    // ═══════════════════════════════════════════
    fn cancel_request(
        request: LoanRequest,
    ) -> (Collateral, Final) {
        assert_eq(request.borrower, self.signer);

        let hash: field = request.request_hash;

        let unlocked: Collateral = Collateral {
            owner: request.borrower,
            amount: request.collateral,
            is_locked: false,
        };

        return (unlocked, final {
            Mapping::set(request_exists, hash, false);
            Mapping::set(request_filled, hash, true);
        });
    }

    // ═══════════════════════════════════════════
    // 2. APPROVE LOAN
    // Lender safely verifies constraints without illegally consuming borrower's ZK Record
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
        assert_neq(lender, borrower);
        assert(amount > 0u64);
        assert(interest_rate <= 5000u64);

        // Natively inline compute_request_hash
        let h1: field = BHP256::hash_to_field(amount as u128);
        let h2: field = BHP256::hash_to_field(duration as u128);
        let h3: field = BHP256::hash_to_field(collateral as u128);
        let h4: field = BHP256::hash_to_field(borrower);
        let combined: field = h1 + h2 + h3 + nonce + h4;
        let computed_hash: field = BHP256::hash_to_field(combined);
        
        assert_eq(computed_hash, request_hash);

        let interest: u64 = (amount * interest_rate) / 10000u64;
        let total: u64 = amount + interest;

        let lid_input: field = request_hash + BHP256::hash_to_field(lender) + BHP256::hash_to_field(interest_rate as u128);
        let loan_id: field = BHP256::hash_to_field(lid_input);

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
            let exists: bool = Mapping::get_or_use(request_exists, request_hash, false);
            assert(exists);
            let filled: bool = Mapping::get_or_use(request_filled, request_hash, false);
            assert(!filled);

            let req_borrower: address = Mapping::get(request_borrower, request_hash);
            assert_eq(req_borrower, borrower);

            let tier: u8 = credaris_credit_v4.aleo::credit_tier.get_or_use(borrower, 0u8);
            assert(tier > 0u8);
            assert(tier <= 3u8);

            // Natively inline min_collateral_for_tier
            let ratio: u64 = tier == 1u8 ? 10u64 :
                             tier == 2u8 ? 25u64 :
                             tier == 3u8 ? 40u64 : 100u64;
            let min_col: u64 = (amount * ratio) / 100u64;
            assert(collateral >= min_col);

            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            Mapping::set(request_filled, request_hash, true);
            Mapping::set(loan_active, loan_id, true);
            Mapping::set(has_active_loan, borrower, true);
        });
    }

    // ═══════════════════════════════════════════
    // 3. REPAY LOAN
    // When completed, it safely securely mints an unlocked replacement Collateral parameter.
    // ═══════════════════════════════════════════

    fn repay_loan(
        agreement: LoanAgreement,
        amount: u64,
    ) -> (LoanAgreement, RepaymentReceipt, Collateral, Final) {
        assert_eq(agreement.borrower, self.signer);
        assert(agreement.is_active);
        
        let remaining_before: u64 = agreement.total_due - agreement.amount_repaid;
        assert(amount <= remaining_before);

        let new_repaid: u64 = agreement.amount_repaid + amount;
        let new_remaining: u64 = remaining_before - amount;
        let still_active: bool = new_remaining > 0u64;

        let b: address = agreement.borrower;
        let lid: field = agreement.loan_id;

        let updated: LoanAgreement = LoanAgreement {
            owner: b, borrower: b, lender: agreement.lender, principal: agreement.principal,
            interest_rate: agreement.interest_rate, collateral: agreement.collateral,
            total_due: agreement.total_due, amount_repaid: new_repaid, due_by: agreement.due_by,
            is_active: still_active, loan_id: lid,
        };

        let receipt: RepaymentReceipt = RepaymentReceipt {
            owner: b, borrower: b, amount_paid: amount, remaining: new_remaining, loan_id: lid,
        };

        let returned_collateral: u64 = still_active ? 0u64 : agreement.collateral; 

        let unlocked_backing: Collateral = Collateral {
            owner: b,
            amount: returned_collateral,
            is_locked: false,
        };

        return (updated, receipt, unlocked_backing, final {
            if !still_active {
                Mapping::set(loan_active, lid, false);
                Mapping::set(has_active_loan, b, false);
            }
        });
    }

    // ═══════════════════════════════════════════
    // 4. CLAIM DEFAULT 
    // Allows lenders to explicitly consume defaults
    // ═══════════════════════════════════════════

    fn claim_default(
        agreement: LoanAgreement,
    ) -> (LoanAgreement, Collateral, Final) {
        assert_eq(agreement.lender, self.signer);
        assert(agreement.is_active);
        
        let seized: Collateral = Collateral {
            owner: agreement.lender,
            amount: agreement.collateral,
            is_locked: false,
        };

        let voided: LoanAgreement = LoanAgreement {
            owner: agreement.lender, borrower: agreement.borrower, lender: agreement.lender,
            principal: agreement.principal, interest_rate: agreement.interest_rate, collateral: agreement.collateral,
            total_due: agreement.total_due, amount_repaid: agreement.amount_repaid, due_by: agreement.due_by,
            is_active: false, loan_id: agreement.loan_id,
        };

        let captured_loan_id: field = agreement.loan_id;

        return (voided, seized, final {
            Mapping::set(loan_active, captured_loan_id, false);
        });
    }

    @noupgrade
    constructor() {}
}
