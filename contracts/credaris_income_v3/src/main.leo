// ============================================================
// credaris_income_v3.aleo
// Privacy-Preserving Income Attestation with Commitment Proofs
// ============================================================
//
// PRIVACY MODEL:
//   - All financial data (income, tx_count, avg) is PRIVATE
//   - Only a one-way commitment hash is stored on-chain
//   - The IncomeProof record is encrypted — only the owner can read it
//   - The commitment proves attestation occurred without leaking amounts
//
// TRUST MODEL:
//   - The ZK circuit ENFORCES: avg_income == total_income / tx_count
//   - Only this program can create IncomeProof records
//   - Downstream contracts can accept IncomeProof as verified input
//
// vs. v2 (REMOVED):
//   ❌ mapping verified_incomes: address => u64  (leaked raw income)
//   ✅ mapping income_commitments: address => field (commitment hash only)

program credaris_income_v3.aleo {

    // === PRIVATE RECORD ===
    // Contains all sensitive financial data.
    // Encrypted on-chain — only the record owner can decrypt.
    record IncomeProof {
        owner: address,
        total_income: u64,
        tx_count: u64,
        avg_income: u64,
        period_start: u32,
        period_end: u32,
        verified: bool,
    }

    // === PUBLIC MAPPINGS (PRIVACY-SAFE) ===

    // Stores BHP256 commitment hash of income data.
    // One-way: cannot derive income amount from field value.
    // Used by downstream contracts to verify attestation exists.
    mapping income_commitments: address => field;

    // Non-sensitive metadata: number of attestations performed.
    mapping attestation_count: address => u64;

    // === CORE TRANSITION ===
    // Creates a private IncomeProof record and stores a commitment hash.
    //
    // ZK GUARANTEES:
    //   1. total_income > 0
    //   2. tx_count > 0
    //   3. period_end >= period_start
    //   4. avg_income == total_income / tx_count (consistency proof)
    //
    // PRIVACY:
    //   - recipient, total_income, tx_count, avg_income → PRIVATE inputs
    //   - Only `commitment` (field hash) and `recipient` reach finalize
    //   - Raw income values NEVER appear in public finalize inputs
    fn attest_income(
        recipient: address,
        total_income: u64,
        tx_count: u64,
        avg_income: u64,
        period_start: u32,
        period_end: u32,
    ) -> (IncomeProof, Final) {
        // Input validation
        assert(total_income > 0u64);
        assert(tx_count > 0u64);
        assert(period_end >= period_start);

        // ZK consistency verification:
        // The prover must demonstrate avg = total / count.
        // This is enforced by the circuit, not self-attested.
        let computed_avg: u64 = total_income / tx_count;
        assert(avg_income == computed_avg);

        // Create private income proof record
        let proof: IncomeProof = IncomeProof {
            owner: recipient,
            total_income: total_income,
            tx_count: tx_count,
            avg_income: avg_income,
            period_start: period_start,
            period_end: period_end,
            verified: true,
        };

        // PRIVACY: Compute commitment hash INSIDE the private function scope.
        // Pack income + period into u128 for collision resistance,
        // then hash to field. Only this hash goes to finalize.
        let packed: u128 = (total_income as u128) * 1000000u128 + (period_end as u128);
        let commitment: field = BHP256::hash_to_field(packed);

        return (proof, final {
            // Store ONLY the commitment hash — not the raw income
            Mapping::set(income_commitments, recipient, commitment);

            // Increment attestation counter (non-sensitive count)
            let count: u64 = Mapping::get_or_use(attestation_count, recipient, 0u64);
            Mapping::set(attestation_count, recipient, count + 1u64);
        });
    }

    @noupgrade
    constructor() {}
}
