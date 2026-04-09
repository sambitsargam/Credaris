program credaris_income_v1.aleo {
    record IncomeProof {
        owner: address,
        total_income: u64,
        tx_count: u64,
        avg_income: u64,
        period_start: u32,
        period_end: u32,
        verified: bool,
    }

    mapping verified_incomes: address => u64;
    mapping attestation_count: address => u64;

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
        assert(avg_income == computed_avg);

        let proof: IncomeProof = IncomeProof {
            owner: recipient,
            total_income: total_income,
            tx_count: tx_count,
            avg_income: avg_income,
            period_start: period_start,
            period_end: period_end,
            verified: true,
        };

        return (proof, final {
            let current: u64 = Mapping::get_or_use(verified_incomes, recipient, 0u64);
            Mapping::set(verified_incomes, recipient, current + total_income);
            let count: u64 = Mapping::get_or_use(attestation_count, recipient, 0u64);
            Mapping::set(attestation_count, recipient, count + 1u64);
        });
    }

    fn publish_income_hash(proof: IncomeProof) -> (IncomeProof, Final) {
        assert_eq(proof.owner, self.signer);
        assert(proof.verified);

        let owner_addr: address = proof.owner;
        let income_val: u64 = proof.total_income;

        let updated: IncomeProof = IncomeProof {
            owner: proof.owner,
            total_income: proof.total_income,
            tx_count: proof.tx_count,
            avg_income: proof.avg_income,
            period_start: proof.period_start,
            period_end: proof.period_end,
            verified: proof.verified,
        };

        return (updated, final {
            Mapping::set(verified_incomes, owner_addr, income_val);
        });
    }

    @noupgrade
    constructor() {}
}
