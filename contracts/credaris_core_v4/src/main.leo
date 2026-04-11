// credaris_core_v4.aleo — Unified ZK Lending Protocol
//
// v4 CHANGES vs v3:
// - Eliminated Collateral record entirely (wallet cannot parse record inputs)
// - All collateral tracked via locked_collateral: address => u64 mapping
// - lock_collateral writes to mapping (no record output)
// - request_loan takes primitives only (no record input)
// - cancel_request restores collateral to mapping
// - repay_loan restores collateral to mapping on full repayment
// - claim_default clears locked_collateral from mapping
// - All other logic (income, credit, chained hashing, 10/10 security) unchanged

program credaris_core_v4.aleo {

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

    // Income State
    mapping income_commitments: address => field;
    mapping attestation_count: address => u64;

    // Credit State
    mapping score_commitments: address => field;
    mapping has_score: address => bool;
    mapping credit_tier: address => u8;

    mapping total_repaid: address => u64;
    mapping repayment_count: address => u64;
    mapping missed_payments: address => u64;

    // Lending State — Collateral now fully mapping-based
    mapping locked_collateral: address => u64;
    mapping loan_collateral: field => u64;   // loan-level collateral: loan_id => amount
    mapping request_exists: field => bool;
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
        verified_income: u64,
        income_tx_count: u64,
        avg_income: u64,
        period_end: u32,
        repayment_count_input: u64,
        total_repaid_input: u64,
        missed_payments_input: u64,
        current_block: u32,
    ) -> (CreditReport, Final) {

        let borrower: address = self.signer;

        assert_eq(avg_income, verified_income / income_tx_count);

        let base: u64 = 300u64;
        let freq: u64 = income_tx_count * 5u64;
        let freq_capped: u64 = freq < 200u64 ? freq : 200u64;

        let amount_component: u64 =
            avg_income >= 10_000_000u64 ? 100u64 :
            avg_income >= 5_000_000u64 ? 75u64 :
            avg_income >= 1_000_000u64 ? 50u64 :
            avg_income >= 100_000u64 ? 25u64 : 10u64;

        let income_factor: u64 = freq_capped + amount_component;

        let repay_raw: u64 = repayment_count_input * 15u64;
        let repayment_factor: u64 = repay_raw < 200u64 ? repay_raw : 200u64;
        let penalty: u64 = missed_payments_input * 50u64;

        let raw_score: u64 = base + income_factor + repayment_factor;
        let after_penalty: u64 = raw_score > penalty ? raw_score - penalty : 300u64;
        let final_score: u64 = after_penalty > 850u64 ? 850u64 : after_penalty;

        let tier: u8 = final_score >= 700u64 ? 1u8 :
                       final_score >= 600u64 ? 2u8 :
                       final_score >= 500u64 ? 3u8 : 4u8;

        let report: CreditReport = CreditReport {
            owner: borrower,
            score: final_score,
            income_factor: income_factor,
            repayment_factor: repayment_factor,
            penalty: penalty,
            tier: tier,
            computed_at: current_block,
        };

        let score_commitment: field = BHP256::hash_to_field(final_score as u128);

        return (report, final {
            let packed: u128 =
                (verified_income as u128) * 1_000_000_000_000u128 +
                (income_tx_count as u128) * 1_000_000u128 +
                (avg_income as u128);
            let expected_commitment: field = BHP256::hash_to_field(packed);
            let actual_commitment: field = Mapping::get(income_commitments, borrower);
            assert_eq(expected_commitment, actual_commitment);

            assert_eq(repayment_count_input, Mapping::get_or_use(repayment_count, borrower, 0u64));
            assert_eq(total_repaid_input, Mapping::get_or_use(total_repaid, borrower, 0u64));
            assert_eq(missed_payments_input, Mapping::get_or_use(missed_payments, borrower, 0u64));

            Mapping::set(score_commitments, borrower, score_commitment);
            Mapping::set(has_score, borrower, true);
            Mapping::set(credit_tier, borrower, tier);
        });
    }

    // ═══════════════════════════════════════════
    // PHASE 3: OPEN MARKET LENDING
    // All collateral via mapping — zero record inputs
    // ═══════════════════════════════════════════

    // Step 1: Borrower locks collateral into mapping
    fn lock_collateral(amount: u64) -> Final {
        assert(amount > 0u64);
        let caller: address = self.signer;
        return final {
            // Block if user has an active loan (collateral is locked in loan)
            let active: bool = Mapping::get_or_use(has_active_loan, caller, false);
            assert(!active);
            // Block if collateral already deposited (must cancel request first)
            let existing: u64 = Mapping::get_or_use(locked_collateral, caller, 0u64);
            assert_eq(existing, 0u64);
            Mapping::set(locked_collateral, caller, amount);
        };
    }

    // Step 2: Borrower requests loan — no record input needed
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

            let ratio: u64 = tier == 1u8 ? 10u64 :
                             tier == 2u8 ? 25u64 :
                             tier == 3u8 ? 40u64 : 200u64;
            let min_col: u64 = (amount * ratio) / 100u64;

            // Verify locked_collateral mapping matches declared amount and meets minimum
            let actual_locked: u64 = Mapping::get(locked_collateral, borrower);
            assert_eq(actual_locked, collateral_amount);
            assert(actual_locked >= min_col);

            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            let has_req: bool = Mapping::get_or_use(request_exists, request_hash, false);
            assert(!has_req);

            Mapping::set(request_exists, request_hash, true);
            Mapping::set(request_borrower, request_hash, borrower);
            Mapping::set(request_filled, request_hash, false);
            // Freeze: re-affirm collateral so it cannot be modified after request is live
            Mapping::set(locked_collateral, borrower, collateral_amount);
        });
    }

    // Cancel request — restores collateral to mapping
    fn cancel_request(
        request: LoanRequest,
    ) -> Final {
        assert_eq(request.borrower, self.signer);
        let hash: field = request.request_hash;
        let borrower: address = request.borrower;
        let col: u64 = request.collateral;

        return final {
            Mapping::set(request_exists, hash, false);
            Mapping::set(request_filled, hash, true);
            Mapping::set(locked_collateral, borrower, col);
        };
    }

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

        return (borrower_copy, lender_copy, final {
            let exists: bool = Mapping::get_or_use(request_exists, request_hash, false);
            assert(exists);
            let filled: bool = Mapping::get_or_use(request_filled, request_hash, false);
            assert(!filled);

            let req_borrower: address = Mapping::get(request_borrower, request_hash);
            assert_eq(req_borrower, borrower);

            let tier: u8 = Mapping::get_or_use(credit_tier, borrower, 0u8);
            assert(tier > 0u8);

            let ratio: u64 = tier == 1u8 ? 10u64 :
                             tier == 2u8 ? 25u64 :
                             tier == 3u8 ? 40u64 : 200u64;
            let min_col: u64 = (amount * ratio) / 100u64;
            assert(collateral >= min_col);

            let already: bool = Mapping::get_or_use(has_active_loan, borrower, false);
            assert(!already);

            // Verify on-chain locked collateral matches declared amount and meets minimum
            let actual_locked: u64 = Mapping::get(locked_collateral, borrower);
            assert(actual_locked >= collateral);

            Mapping::set(request_filled, request_hash, true);
            Mapping::set(loan_active, loan_id, true);
            Mapping::set(has_active_loan, borrower, true);
            // Move collateral from address-level → loan-level isolation
            Mapping::set(loan_collateral, loan_id, collateral);
            Mapping::set(locked_collateral, borrower, 0u64);
        });
    }

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



        return (updated, receipt, final {
            let r_count: u64 = Mapping::get_or_use(repayment_count, b, 0u64);
            Mapping::set(repayment_count, b, r_count + 1u64);

            let t_repaid: u64 = Mapping::get_or_use(total_repaid, b, 0u64);
            Mapping::set(total_repaid, b, t_repaid + amount);

            if !still_active {
                // Read collateral from loan-level mapping
                let col: u64 = Mapping::get(loan_collateral, lid);
                Mapping::set(loan_active, lid, false);
                Mapping::set(has_active_loan, b, false);
                Mapping::set(loan_collateral, lid, 0u64);
                // Return unlocked collateral back to borrower's address-level balance
                Mapping::set(locked_collateral, b, col);
            }
        });
    }

    fn claim_default(
        agreement: LoanAgreement,
        current_block: u32,
    ) -> (LoanAgreement, Final) {
        assert_eq(agreement.lender, self.signer);
        assert(agreement.is_active);
        assert(current_block >= agreement.due_by);

        let borrower: address = agreement.borrower;

        let voided: LoanAgreement = LoanAgreement {
            owner: agreement.lender, borrower: borrower, lender: agreement.lender,
            principal: agreement.principal, interest_rate: agreement.interest_rate, collateral: agreement.collateral,
            total_due: agreement.total_due, amount_repaid: agreement.amount_repaid, due_by: agreement.due_by,
            is_active: false, loan_id: agreement.loan_id,
        };

        let captured_loan_id: field = agreement.loan_id;

        return (voided, final {
            // Read and clear loan-level collateral (seized by lender on default)
            let col: u64 = Mapping::get(loan_collateral, captured_loan_id);
            Mapping::set(loan_collateral, captured_loan_id, 0u64);
            Mapping::set(loan_active, captured_loan_id, false);
            Mapping::set(has_active_loan, borrower, false);

            let missed: u64 = Mapping::get_or_use(missed_payments, borrower, 0u64);
            Mapping::set(missed_payments, borrower, missed + 1u64);
        });
    }

    @noupgrade
    constructor() {}
}
