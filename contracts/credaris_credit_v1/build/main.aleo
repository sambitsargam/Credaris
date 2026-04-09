program credaris_credit_v1.aleo;

record CreditReport:
    owner as address.private;
    score as u64.private;
    income_factor as u64.private;
    repayment_factor as u64.private;
    penalty as u64.private;
    computed_at as u32.private;

mapping credit_scores:
    key as address.public;
    value as u64.public;

mapping score_history_count:
    key as address.public;
    value as u64.public;

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
    gte r4 r6 into r8;
    assert.eq r8 true;
    mul r2 5u64 into r9;
    lt r9 200u64 into r10;
    ternary r10 r9 200u64 into r11;
    gte r3 10000000u64 into r12;
    gte r3 5000000u64 into r13;
    gte r3 1000000u64 into r14;
    gte r3 100000u64 into r15;
    ternary r15 25u64 10u64 into r16;
    ternary r14 50u64 r16 into r17;
    ternary r13 75u64 r17 into r18;
    ternary r12 100u64 r18 into r19;
    add r11 r19 into r20;
    mul r4 15u64 into r21;
    lt r21 200u64 into r22;
    ternary r22 r21 200u64 into r23;
    mul r6 50u64 into r24;
    add 300u64 r20 into r25;
    add r25 r23 into r26;
    gt r26 r24 into r27;
    sub r26 r24 into r28;
    ternary r27 r28 300u64 into r29;
    lt r29 850u64 into r30;
    ternary r30 r29 850u64 into r31;
    gt r31 300u64 into r32;
    ternary r32 r31 300u64 into r33;
    cast r0 r33 r20 r23 r24 r7 into r34 as CreditReport.record;
    async compute_score r0 r33 into r35;
    output r34 as CreditReport.record;
    output r35 as credaris_credit_v1.aleo/compute_score.future;

finalize compute_score:
    input r0 as address.public;
    input r1 as u64.public;
    set r1 into credit_scores[r0];
    get.or_use score_history_count[r0] 0u64 into r2;
    add r2 1u64 into r3;
    set r3 into score_history_count[r0];

function publish_score:
    input r0 as CreditReport.record;
    assert.eq r0.owner self.signer;
    cast r0.owner r0.score r0.income_factor r0.repayment_factor r0.penalty r0.computed_at into r1 as CreditReport.record;
    async publish_score r0.owner r0.score into r2;
    output r1 as CreditReport.record;
    output r2 as credaris_credit_v1.aleo/publish_score.future;

finalize publish_score:
    input r0 as address.public;
    input r1 as u64.public;
    set r1 into credit_scores[r0];

constructor:
    assert.eq edition 0u16;
