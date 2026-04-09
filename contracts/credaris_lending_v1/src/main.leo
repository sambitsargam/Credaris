program credaris_lending_v1.aleo {
    record LoanRequest {
        owner: address,
        borrower: address,
        amount: u64,
        interest_rate: u64,
        duration: u32,
        request_id: field,
    }

    record LoanAgreement {
        owner: address,
        borrower: address,
        lender: address,
        principal: u64,
        interest_rate: u64,
        total_due: u64,
        amount_repaid: u64,
        approved_at: u32,
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

    mapping active_loans: field => u64;
    mapping loan_count: address => u64;
    mapping total_repaid: address => u64;
    mapping repayment_count: address => u64;

    fn request_loan(
        borrower: address,
        amount: u64,
        interest_rate: u64,
        duration: u32,
    ) -> LoanRequest {
        assert_eq(borrower, self.signer);
        assert(amount > 0u64);
        assert(amount <= 1000000000u64);
        assert(interest_rate > 0u64);
        assert(interest_rate <= 5000u64);
        assert(duration > 0u32);

        let request_id: field = BHP256::hash_to_field(borrower);

        return LoanRequest {
            owner: borrower,
            borrower: borrower,
            amount: amount,
            interest_rate: interest_rate,
            duration: duration,
            request_id: request_id,
        };
    }

    fn approve_loan(
        request: LoanRequest,
        lender: address,
        current_block: u32,
    ) -> (LoanAgreement, LoanAgreement, Final) {
        assert_eq(lender, self.signer);
        let is_self_loan: bool = lender == request.borrower;
        assert(!is_self_loan);

        let req_borrower: address = request.borrower;
        let req_amount: u64 = request.amount;
        let req_rate: u64 = request.interest_rate;
        let req_duration: u32 = request.duration;
        let req_id: field = request.request_id;

        let interest: u64 = (req_amount * req_rate) / 10000u64;
        let total_due: u64 = req_amount + interest;
        let due_by: u32 = current_block + req_duration;
        let loan_id: field = BHP256::hash_to_field(req_id);

        let borrower_agreement: LoanAgreement = LoanAgreement {
            owner: req_borrower,
            borrower: req_borrower,
            lender: lender,
            principal: req_amount,
            interest_rate: req_rate,
            total_due: total_due,
            amount_repaid: 0u64,
            approved_at: current_block,
            due_by: due_by,
            is_active: true,
            loan_id: loan_id,
        };

        let lender_agreement: LoanAgreement = LoanAgreement {
            owner: lender,
            borrower: req_borrower,
            lender: lender,
            principal: req_amount,
            interest_rate: req_rate,
            total_due: total_due,
            amount_repaid: 0u64,
            approved_at: current_block,
            due_by: due_by,
            is_active: true,
            loan_id: loan_id,
        };

        return (borrower_agreement, lender_agreement, final {
            Mapping::set(active_loans, loan_id, total_due);
            let count: u64 = Mapping::get_or_use(loan_count, req_borrower, 0u64);
            Mapping::set(loan_count, req_borrower, count + 1u64);
        });
    }

    fn repay_loan(
        agreement: LoanAgreement,
        amount: u64,
    ) -> (LoanAgreement, RepaymentReceipt, Final) {
        assert_eq(agreement.borrower, self.signer);
        assert(agreement.is_active);
        assert(amount > 0u64);

        let agr_borrower: address = agreement.borrower;
        let agr_lender: address = agreement.lender;
        let agr_principal: u64 = agreement.principal;
        let agr_rate: u64 = agreement.interest_rate;
        let agr_total_due: u64 = agreement.total_due;
        let agr_repaid: u64 = agreement.amount_repaid;
        let agr_approved: u32 = agreement.approved_at;
        let agr_due_by: u32 = agreement.due_by;
        let agr_loan_id: field = agreement.loan_id;

        let remaining_before: u64 = agr_total_due - agr_repaid;
        assert(amount <= remaining_before);

        let new_repaid: u64 = agr_repaid + amount;
        let new_remaining: u64 = remaining_before - amount;
        let still_active: bool = new_remaining > 0u64;

        let updated_agreement: LoanAgreement = LoanAgreement {
            owner: agr_borrower,
            borrower: agr_borrower,
            lender: agr_lender,
            principal: agr_principal,
            interest_rate: agr_rate,
            total_due: agr_total_due,
            amount_repaid: new_repaid,
            approved_at: agr_approved,
            due_by: agr_due_by,
            is_active: still_active,
            loan_id: agr_loan_id,
        };

        let receipt: RepaymentReceipt = RepaymentReceipt {
            owner: agr_borrower,
            borrower: agr_borrower,
            amount_paid: amount,
            remaining: new_remaining,
            loan_id: agr_loan_id,
        };

        return (updated_agreement, receipt, final {
            Mapping::set(active_loans, agr_loan_id, new_remaining);
            let prev_total: u64 = Mapping::get_or_use(total_repaid, agr_borrower, 0u64);
            Mapping::set(total_repaid, agr_borrower, prev_total + amount);
            let prev_count: u64 = Mapping::get_or_use(repayment_count, agr_borrower, 0u64);
            Mapping::set(repayment_count, agr_borrower, prev_count + 1u64);
            if !still_active {
                let active_count: u64 = Mapping::get_or_use(loan_count, agr_borrower, 0u64);
                let new_count: u64 = active_count > 0u64 ? active_count - 1u64 : 0u64;
                Mapping::set(loan_count, agr_borrower, new_count);
            }
        });
    }

    @noupgrade
    constructor() {}
}
