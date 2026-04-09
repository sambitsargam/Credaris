program credaris_credit_v1.aleo {
    record CreditReport {
        owner: address,
        score: u64,
        income_factor: u64,
        repayment_factor: u64,
        penalty: u64,
        computed_at: u32,
    }

    mapping credit_scores: address => u64;
    mapping score_history_count: address => u64;

    fn compute_score(
        recipient: address,
        verified_income: u64,
        income_tx_count: u64,
        avg_income: u64,
        repayment_count: u64,
        total_repaid: u64,
        missed_payments: u64,
        current_block: u32,
    ) -> (CreditReport, Final) {
        assert_eq(recipient, self.signer);
        assert(repayment_count >= missed_payments);

        let freq_raw: u64 = income_tx_count * 5u64;
        let freq_component: u64 = freq_raw < 200u64 ? freq_raw : 200u64;

        let amount_component: u64 =
            avg_income >= 10000000u64 ? 100u64 :
            avg_income >= 5000000u64 ? 75u64 :
            avg_income >= 1000000u64 ? 50u64 :
            avg_income >= 100000u64 ? 25u64 :
            10u64;

        let income_factor: u64 = freq_component + amount_component;

        let repay_raw: u64 = repayment_count * 15u64;
        let repayment_factor: u64 = repay_raw < 200u64 ? repay_raw : 200u64;

        let penalty: u64 = missed_payments * 50u64;

        let base_score: u64 = 300u64;
        let raw_score: u64 = base_score + income_factor + repayment_factor;
        let after_penalty: u64 = raw_score > penalty ? raw_score - penalty : 300u64;
        let final_score: u64 = after_penalty < 850u64 ? after_penalty : 850u64;
        let clamped_score: u64 = final_score > 300u64 ? final_score : 300u64;

        let report: CreditReport = CreditReport {
            owner: recipient,
            score: clamped_score,
            income_factor: income_factor,
            repayment_factor: repayment_factor,
            penalty: penalty,
            computed_at: current_block,
        };

        return (report, final {
            Mapping::set(credit_scores, recipient, clamped_score);
            let count: u64 = Mapping::get_or_use(score_history_count, recipient, 0u64);
            Mapping::set(score_history_count, recipient, count + 1u64);
        });
    }

    fn publish_score(report: CreditReport) -> (CreditReport, Final) {
        assert_eq(report.owner, self.signer);

        let owner_addr: address = report.owner;
        let score_val: u64 = report.score;

        let updated: CreditReport = CreditReport {
            owner: report.owner,
            score: report.score,
            income_factor: report.income_factor,
            repayment_factor: report.repayment_factor,
            penalty: report.penalty,
            computed_at: report.computed_at,
        };

        return (updated, final {
            Mapping::set(credit_scores, owner_addr, score_val);
        });
    }

    @noupgrade
    constructor() {}
}
