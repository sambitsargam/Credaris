program credaris_income_v3.aleo;

record IncomeProof:
    owner as address.private;
    total_income as u64.private;
    tx_count as u64.private;
    avg_income as u64.private;
    period_start as u32.private;
    period_end as u32.private;
    verified as boolean.private;

mapping income_commitments:
    key as address.public;
    value as field.public;

mapping attestation_count:
    key as address.public;
    value as u64.public;

function attest_income:
    input r0 as address.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u32.private;
    input r5 as u32.private;
    gt r1 0u64 into r6;
    assert.eq r6 true;
    gt r2 0u64 into r7;
    assert.eq r7 true;
    gte r5 r4 into r8;
    assert.eq r8 true;
    div r1 r2 into r9;
    is.eq r3 r9 into r10;
    assert.eq r10 true;
    cast r0 r1 r2 r3 r4 r5 true into r11 as IncomeProof.record;
    cast r1 into r12 as u128;
    mul r12 1000000u128 into r13;
    cast r5 into r14 as u128;
    add r13 r14 into r15;
    hash.bhp256 r15 into r16 as field;
    async attest_income r0 r16 into r17;
    output r11 as IncomeProof.record;
    output r17 as credaris_income_v3.aleo/attest_income.future;

finalize attest_income:
    input r0 as address.public;
    input r1 as field.public;
    set r1 into income_commitments[r0];
    get.or_use attestation_count[r0] 0u64 into r2;
    add r2 1u64 into r3;
    set r3 into attestation_count[r0];

constructor:
    assert.eq edition 0u16;
