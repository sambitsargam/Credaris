import credits.aleo;

// ═══════════════════════════════════════════
// HELPER FUNCTIONS (MODULAR DRY)
// ═══════════════════════════════════════════

fn get_min_collateral(amount: u64, tier: u8) -> u64 {
    let ratio: u64 = tier == 1u8 ? 10u64 :
                     tier == 2u8 ? 25u64 :
                     tier == 3u8 ? 40u64 : 200u64;
    return (amount * ratio) / 100u64;
}

program credaris_core_v8.aleo {

    // ═══════════════════════════════════════════
    // RECORDS
    // ═══════════════════════════════════════════

    record IncomeProof {
        owner: address,
        total_income: u64,
        tx_count: u64,
        avg_income: u64,
        period_start: u32,
        period_end: u32,
        verified: bool,
    }

    record CreditReport {
        owner: address,
        score: u64,
        income_factor: u64,
        repayment_factor: u64,
        penalty: u64,
        tier: u8,
        computed_at: u32,
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

    mapping income_commitments: address => field;
    mapping attestation_count: address => u64;

    mapping score_commitments: address => field;
    mapping has_score: address => bool;
    mapping credit_tier: address => u8;

    mapping total_repaid: address => u64;
    mapping repayment_count: address => u64;
    mapping missed_payments: address => u64;

    mapping locked_collateral: address => u64;
    mapping loan_collateral: field => u64;
    mapping request_collateral: field => u64;
    mapping request_borrower: field => address;
    mapping request_filled: field => bool;
    mapping loan_active: field => bool;
    mapping has_active_loan: address => bool;

    // ═══════════════════════════════════════════
    // PHASE 1: INCOME VERIFICATION
    // ═══════════════════════════════════════════

    fn attest_income(
        recipient: address,
        total_income: u64,
        tx_count: u64,
        avg_income: u64,
        period_start: u32,
        period_end: u32,
    ) -> (IncomeProof, Final) {
        assert(total_income > 0u64);
        assert(tx_count > 0u64);
        assert(period_end >= period_start);

        let computed_avg: u64 = total_income / tx_count;
        assert_eq(avg_income, computed_avg);

        let proof: IncomeProof = IncomeProof {
            owner: recipient,
            total_income: total_income,
            tx_count: tx_count,
            avg_income: avg_income,
            period_start: period_start,
            period_end: period_end,
            verified: true,
        };

        let packed: u128 =
            (total_income as u128) * 1_000_000_000_000u128 +
            (tx_count as u128) * 1_000_000u128 +
            (avg_income as u128);
        let commitment: field = BHP256::hash_to_field(packed);

        return (proof, final {
            Mapping::set(income_commitments, recipient, commitment);
            let count: u64 = Mapping::get_or_use(attestation_count, recipient, 0u64);
            Mapping::set(attestation_count, recipient, count + 1u64);
        });
    }

    // ═══════════════════════════════════════════
    // PHASE 2: CREDIT SCORING
    // ═══════════════════════════════════════════

    fn compute_score(
        borrower: address,
        total_income: u64,
        tx_count: u64,
        avg_income: u64,
        repayment_count_val: u64,
        missed_count: u64,
        computed_at: u32,
    ) -> (CreditReport, Final) {
        let income_factor: u64 =
            tx_count >= 20u64 ? 200u64 :
            tx_count >= 10u64 ? 150u64 :
            tx_count >= 5u64  ? 100u64 :
            tx_count >= 1u64  ? 50u64  : 0u64;

        let avg_factor: u64 =
            avg_income >= 10_000_000u64 ? 150u64 :
            avg_income >= 5_000_000u64  ? 100u64 :
            avg_income >= 1_000_000u64  ? 75u64  :
            avg_income >= 100_000u64    ? 25u64  : 0u64;

        let repayment_factor: u64 =
            repayment_count_val >= 10u64 ? 200u64 :
            repayment_count_val >= 5u64  ? 150u64 :
            repayment_count_val >= 1u64  ? 100u64 : 0u64;

        let penalty: u64 = missed_count * 50u64;
        let raw: u64 = 300u64 + income_factor + avg_factor + repayment_factor;
        let score: u64 = raw > penalty ? raw - penalty : 300u64;
        let clamped: u64 = score > 850u64 ? 850u64 : score;

        let tier: u8 =
            clamped >= 750u64 ? 1u8 :
            clamped >= 650u64 ? 2u8 :
            clamped >= 500u64 ? 3u8 : 4u8;

        let report: CreditReport = CreditReport {
            owner: borrower,
            score: clamped,
            income_factor: income_factor,
            repayment_factor: repayment_factor,
            penalty: penalty,
            tier: tier,
            computed_at: computed_at,
        };

        let packed_income: u128 = (total_income as u128) * 1_000_000_000_000u128 + (tx_count as u128) * 1_000_000u128 + (avg_income as u128);
        let recovered_commitment: field = BHP256::hash_to_field(packed_income);

        let packed: u128 = (clamped as u128) * 1_000_000u128 + (computed_at as u128);
        let score_commitment: field = BHP256::hash_to_field(packed);

        return (report, final {
            let expected_commitment: field = Mapping::get(income_commitments, borrower);
            assert_eq(recovered_commitment, expected_commitment);

            let actual_repayment_count: u64 = Mapping::get_or_use(repayment_count, borrower, 0u64);
            assert_eq(actual_repayment_count, repayment_count_val);

            let actual_missed_count: u64 = Mapping::get_or_use(missed_payments, borrower, 0u64);
            assert_eq(actual_missed_count, missed_count);

            Mapping::set(score_commitments, borrower, score_commitment);
            Mapping::set(has_score, borrower, true);
            Mapping::set(credit_tier, borrower, tier);
        });
    }

    // ═══════════════════════════════════════════
    // PHASE 3: OPEN MARKET LENDING & COLLATERAL
    // ═══════════════════════════════════════════

    // LOCK COLLATERAL (ATOMIC PULL)
    fn lock_collateral(amount: u64) -> Final {
        assert(amount > 0u64);
        let caller: address = self.signer;
        
        let f: Final = credits.aleo::transfer_public_as_signer(self.address, amount);
        
        return final {
            f.run();
            let active: bool = Mapping::get_or_use(has_active_loan, caller, false);
            assert(!active);
            let existing: u64 = Mapping::get_or_use(locked_collateral, caller, 0u64);
            Mapping::set(locked_collateral, caller, existing + amount);
        };
    }

    // UNLOCK COLLATERAL (ATOMIC PUSH)
    fn unlock_collateral(amount: u64) -> Final {
        assert(amount > 0u64);
        let caller: address = self.signer;
        
        // PUSH from contract address to user wallet
        let f: Final = credits.aleo::transfer_public(caller, amount);
        
        return final {
            f.run();
            let active: bool = Mapping::get_or_use(has_active_loan, caller, false);
            assert(!active);
            let existing: u64 = Mapping::get(locked_collateral, caller);
            assert(existing >= amount);
            Mapping::set(locked_collateral, caller, existing - amount);
        };
    }

    // REQUEST LOAN
    fn request_loan(
        amount: u64,
        duration: u32,
        collateral_amount: u64,
        nonce: field,
    ) -> (LoanRequest, Final) {
        let borrower: address = self.signer;
        assert(amount > 0u64);
        assert(duration > 0u32);
        assert(collateral_amount > 0u64);

        let h1: field = BHP256::hash_to_field(amount as u128);
        let h2: field = BHP256::hash_to_field(duration as u128);
        let h3: field = BHP256::hash_to_field(collateral_amount as u128);
        let h4: field = BHP256::hash_to_field(borrower);
        let c1: field = BHP256::hash_to_field(h1 + h2);
        let c2: field = BHP256::hash_to_field(c1 + h3);
        let c3: field = BHP256::hash_to_field(c2 + nonce);
        let request_hash: field = BHP256::hash_to_field(c3 + h4);

        let request: LoanRequest = LoanRequest {
            owner: borrower,
            borrower: borrower,
            amount: amount,
            duration: duration,
            collateral: collateral_amount,
            request_hash: request_hash,
        };

        return (request, final {
            let tier: u8 = Mapping::get_or_use(credit_tier, borrower, 0u8);
            assert(tier > 0u8);
            let min_col: u64 = get_min_collateral(amount, tier);

            let actual_locked: u64 = Mapping::get(locked_collateral, borrower);
            assert(actual_locked >= collateral_amount);
            assert(collateral_amount >= min_col);

            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            Mapping::set(locked_collateral, borrower, actual_locked - collateral_amount);
            Mapping::set(request_collateral, request_hash, collateral_amount);
            Mapping::set(request_borrower, request_hash, borrower);
            Mapping::set(request_filled, request_hash, false);
        });
    }

    // CANCEL REQUEST
    fn cancel_request(request: LoanRequest) -> Final {
        assert_eq(request.borrower, self.signer);
        let hash: field = request.request_hash;
        let borrower: address = request.borrower;

        return final {
            let col: u64 = Mapping::get(request_collateral, hash);
            let actual_borrower: address = Mapping::get(request_borrower, hash);
            assert_eq(actual_borrower, borrower);
            
            let active: bool = Mapping::get_or_use(request_filled, hash, false);
            assert(!active);
            
            Mapping::set(request_collateral, hash, 0u64);
            Mapping::set(request_filled, hash, true);
            
            let existing: u64 = Mapping::get_or_use(locked_collateral, borrower, 0u64);
            Mapping::set(locked_collateral, borrower, existing + col);
        };
    }

    // APPROVE LOAN (ATOMIC PUSH to borrower)
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

        let h1: field = BHP256::hash_to_field(amount as u128);
        let h2: field = BHP256::hash_to_field(duration as u128);
        let h3: field = BHP256::hash_to_field(collateral as u128);
        let h4: field = BHP256::hash_to_field(borrower);
        let c1: field = BHP256::hash_to_field(h1 + h2);
        let c2: field = BHP256::hash_to_field(c1 + h3);
        let c3: field = BHP256::hash_to_field(c2 + nonce);
        let computed_hash: field = BHP256::hash_to_field(c3 + h4);
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

        // Transfer principally from lender wallet TO borrower wallet
        let f: Final = credits.aleo::transfer_public(borrower, amount);
        
        return (borrower_copy, lender_copy, final {
            f.run();
            let req_amount: u64 = Mapping::get(request_collateral, request_hash);
            assert_eq(req_amount, collateral);

            let filled: bool = Mapping::get_or_use(request_filled, request_hash, false);
            assert(!filled);
            let req_borrower: address = Mapping::get(request_borrower, request_hash);
            assert_eq(req_borrower, borrower);
            
            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            Mapping::set(request_filled, request_hash, true);
            Mapping::set(request_collateral, request_hash, 0u64);

            Mapping::set(loan_active, loan_id, true);
            Mapping::set(has_active_loan, borrower, true);
            Mapping::set(loan_collateral, loan_id, collateral);
        });
    }

    // REPAY LOAN (ATOMIC PULL to lender)
    fn repay_loan(
        agreement: LoanAgreement,
        amount: u64,
    ) -> (LoanAgreement, RepaymentReceipt, Final) {
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

        // ATOMIC PULL from borrower TO lender
        let f: Final = credits.aleo::transfer_public_as_signer(agreement.lender, amount);
        let lender: address = agreement.lender;

        return (updated, receipt, final {
            f.run();
            let r_count: u64 = Mapping::get_or_use(repayment_count, b, 0u64);
            Mapping::set(repayment_count, b, r_count + 1u64);
            let t_repaid: u64 = Mapping::get_or_use(total_repaid, b, 0u64);
            Mapping::set(total_repaid, b, t_repaid + amount);

            if !still_active {
                let col: u64 = Mapping::get(loan_collateral, lid);
                Mapping::set(loan_active, lid, false);
                Mapping::set(has_active_loan, b, false);
                Mapping::set(loan_collateral, lid, 0u64);
                
                let existing: u64 = Mapping::get_or_use(locked_collateral, b, 0u64);
                Mapping::set(locked_collateral, b, existing + col);
            }
        });
    }

    // CLAIM DEFAULT (ATOMIC PUSH of collateral to lender)
    fn claim_default(
        agreement: LoanAgreement,
    ) -> (LoanAgreement, Final) {
        assert_eq(agreement.lender, self.signer);
        assert(agreement.is_active);

        let borrower: address = agreement.borrower;
        let lender: address = agreement.lender;
        let cap_lid: field = agreement.loan_id;
        let due_block: u32 = agreement.due_by;
        let agree_col: u64 = agreement.collateral;

        let voided: LoanAgreement = LoanAgreement {
            owner: lender, borrower: borrower, lender: lender,
            principal: agreement.principal, interest_rate: agreement.interest_rate, collateral: agreement.collateral,
            total_due: agreement.total_due, amount_repaid: agreement.amount_repaid, due_by: agreement.due_by,
            is_active: false, loan_id: cap_lid,
        };

        // PUSH from contract escrow address to lender wallet
        let f: Final = credits.aleo::transfer_public(lender, agree_col);

        return (voided, final {
            f.run();
            assert(block.height >= due_block);

            let actual_col: u64 = Mapping::get(loan_collateral, cap_lid);
            assert_eq(actual_col, agree_col);

            Mapping::set(loan_collateral, cap_lid, 0u64);
            Mapping::set(loan_active, cap_lid, false);
            Mapping::set(has_active_loan, borrower, false);
            let missed: u64 = Mapping::get_or_use(missed_payments, borrower, 0u64);
            Mapping::set(missed_payments, borrower, missed + 1u64);
        });
    }

    @noupgrade
    constructor() {}
}
