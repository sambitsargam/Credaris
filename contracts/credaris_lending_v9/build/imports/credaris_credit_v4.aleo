import credaris_income_v3.aleo;

program credaris_credit_v4.aleo;

record CreditReport:
    owner as address.private;
    score as u64.private;
    income_factor as u64.private;
    repayment_factor as u64.private;
    penalty as u64.private;
    tier as u8.private;
    computed_at as u32.private;

mapping score_commitments:
    key as address.public;
    value as field.public;

mapping has_score:
    key as address.public;
    value as boolean.public;

mapping credit_tier:
    key as address.public;
    value as u8.public;

function compute_score:
    input r0 as address.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u64.private;
    input r5 as u64.private;
    input r6 as u64.private;
    input r7 as u32.private;
    assert.eq r0 self.signer;
    gt r2 0u64 into r8;
    assert.eq r8 true;
    div r1 r2 into r9;
    assert.eq r3 r9;
    mul r2 5u64 into r10;
    lt r10 200u64 into r11;
    ternary r11 r10 200u64 into r12;
    gte r3 10000000u64 into r13;
    gte r3 5000000u64 into r14;
    gte r3 1000000u64 into r15;
    gte r3 100000u64 into r16;
    ternary r16 25u64 10u64 into r17;
    ternary r15 50u64 r17 into r18;
    ternary r14 75u64 r18 into r19;
    ternary r13 100u64 r19 into r20;
    add r12 r20 into r21;
    mul r4 15u64 into r22;
    lt r22 200u64 into r23;
    ternary r23 r22 200u64 into r24;
    mul r6 50u64 into r25;
    add 300u64 r21 into r26;
    add r26 r24 into r27;
    gt r27 r25 into r28;
    sub r27 r25 into r29;
    ternary r28 r29 300u64 into r30;
    gt r30 850u64 into r31;
    ternary r31 850u64 r30 into r32;
    gte r32 700u64 into r33;
    gte r32 600u64 into r34;
    gte r32 500u64 into r35;
    ternary r35 3u8 4u8 into r36;
    ternary r34 2u8 r36 into r37;
    ternary r33 1u8 r37 into r38;
    cast r0 r32 r21 r24 r25 r38 r7 into r39 as CreditReport.record;
    cast r32 into r40 as u128;
    hash.bhp256 r40 into r41 as field;
    async compute_score r0 r41 r38 into r42;
    output r39 as CreditReport.record;
    output r42 as credaris_credit_v4.aleo/compute_score.future;

finalize compute_score:
    input r0 as address.public;
    input r1 as field.public;
    input r2 as u8.public;
    get.or_use credaris_income_v3.aleo/attestation_count[r0] 0u64 into r3;
    gt r3 0u64 into r4;
    assert.eq r4 true;
    set r1 into score_commitments[r0];
    set true into has_score[r0];
    set r2 into credit_tier[r0];

constructor:
    assert.eq edition 0u16;
