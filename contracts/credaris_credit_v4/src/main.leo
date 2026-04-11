// credaris_credit_v4.aleo — Privacy-Preserving ZK Credit Scoring + Tier System
//
// UPGRADE FROM v3:
//   + mapping credit_tier: address => u8 (public coarse risk bucket)
//   + Tier derived from private score in ZK, only bucket exposed
//   + Lenders assess risk via tier without seeing raw score
//
// TIER SYSTEM:
//   Tier 1 (A) → score ≥ 700  — Low risk
//   Tier 2 (B) → score ≥ 600  — Medium risk
//   Tier 3 (C) → score ≥ 500  — High risk
//   Tier 4 (D) → score < 500  — Very high risk
//
// TRUST: Verifies attestation_count > 0 from credaris_income_v3.aleo
// PRIVACY: Score in private record, only commitment hash + boolean flag + tier public

import credaris_income_v3.aleo;

program credaris_credit_v4.aleo {

    record CreditReport {
        owner: address,
        score: u64,
        income_factor: u64,
        repayment_factor: u64,
        penalty: u64,
        tier: u8,
        computed_at: u32,
    }

    // Only commitment hash — not raw score
    mapping score_commitments: address => field;
    // Boolean eligibility flag for lending
    mapping has_score: address => bool;
    // Coarse credit tier — allows lenders to assess risk without raw score
    // Tier 1 = A (≥700), Tier 2 = B (≥600), Tier 3 = C (≥500), Tier 4 = D (<500)
    mapping credit_tier: address => u8;

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
        assert(income_tx_count > 0u64);

        // ZK-verified: avg must equal total / count
        let expected_avg: u64 = verified_income / income_tx_count;
        assert_eq(avg_income, expected_avg);

        // Score computation (deterministic, all in ZK)
        let base: u64 = 300u64;

        let freq: u64 = income_tx_count * 5u64;
        let freq_capped: u64 = freq < 200u64 ? freq : 200u64;

        let amount_component: u64 =
            avg_income >= 10_000_000u64 ? 100u64 :
            avg_income >= 5_000_000u64 ? 75u64 :
            avg_income >= 1_000_000u64 ? 50u64 :
            avg_income >= 100_000u64 ? 25u64 : 10u64;

        let income_factor: u64 = freq_capped + amount_component;

        let repay_raw: u64 = repayment_count * 15u64;
        let repayment_factor: u64 = repay_raw < 200u64 ? repay_raw : 200u64;

        let penalty: u64 = missed_payments * 50u64;

        let raw_score: u64 = base + income_factor + repayment_factor;
        let after_penalty: u64 = raw_score > penalty ? raw_score - penalty : 300u64;
        let final_score: u64 = after_penalty > 850u64 ? 850u64 : after_penalty;

        // Derive credit tier from private score (ZK — tier is coarse, score stays private)
        let tier: u8 = final_score >= 700u64 ? 1u8 :
                       final_score >= 600u64 ? 2u8 :
                       final_score >= 500u64 ? 3u8 : 4u8;

        let report: CreditReport = CreditReport {
            owner: recipient,
            score: final_score,
            income_factor: income_factor,
            repayment_factor: repayment_factor,
            penalty: penalty,
            tier: tier,
            computed_at: current_block,
        };

        let score_commitment: field = BHP256::hash_to_field(final_score as u128);

        return (report, final {
            // TRUST: Verify user has completed income attestation
            let count: u64 = credaris_income_v3.aleo::attestation_count.get_or_use(recipient, 0u64);
            assert(count > 0u64);

            Mapping::set(score_commitments, recipient, score_commitment);
            Mapping::set(has_score, recipient, true);
            // Publish coarse tier — lenders can assess risk without raw score
            Mapping::set(credit_tier, recipient, tier);
        });
    }

    @noupgrade
    constructor() {}
}
