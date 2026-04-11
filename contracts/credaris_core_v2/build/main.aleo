program credaris_core_v2.aleo;

record IncomeProof:
    owner as address.private;
    total_income as u64.private;
    tx_count as u64.private;
    avg_income as u64.private;
    period_start as u32.private;
    period_end as u32.private;
    verified as boolean.private;

record CreditReport:
    owner as address.private;
    score as u64.private;
    income_factor as u64.private;
    repayment_factor as u64.private;
    penalty as u64.private;
    tier as u8.private;
    computed_at as u32.private;

record Collateral:
    owner as address.private;
    amount as u64.private;
    is_locked as boolean.private;

record LoanRequest:
    owner as address.private;
    borrower as address.private;
    amount as u64.private;
    duration as u32.private;
    collateral as u64.private;
    request_hash as field.private;

record LoanAgreement:
    owner as address.private;
    borrower as address.private;
    lender as address.private;
    principal as u64.private;
    interest_rate as u64.private;
    collateral as u64.private;
    total_due as u64.private;
    amount_repaid as u64.private;
    due_by as u32.private;
    is_active as boolean.private;
    loan_id as field.private;

record RepaymentReceipt:
    owner as address.private;
    borrower as address.private;
    amount_paid as u64.private;
    remaining as u64.private;
    loan_id as field.private;

mapping income_commitments:
    key as address.public;
    value as field.public;

mapping attestation_count:
    key as address.public;
    value as u64.public;

mapping score_commitments:
    key as address.public;
    value as field.public;

mapping has_score:
    key as address.public;
    value as boolean.public;

mapping credit_tier:
    key as address.public;
    value as u8.public;

mapping total_repaid:
    key as address.public;
    value as u64.public;

mapping repayment_count:
    key as address.public;
    value as u64.public;

mapping missed_payments:
    key as address.public;
    value as u64.public;

mapping request_exists:
    key as field.public;
    value as boolean.public;

mapping request_borrower:
    key as field.public;
    value as address.public;

mapping request_filled:
    key as field.public;
    value as boolean.public;

mapping loan_active:
    key as field.public;
    value as boolean.public;

mapping has_active_loan:
    key as address.public;
    value as boolean.public;

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
    assert.eq r3 r9;
    cast r0 r1 r2 r3 r4 r5 true into r10 as IncomeProof.record;
    cast r1 into r11 as u128;
    mul r11 1000000000000u128 into r12;
    cast r2 into r13 as u128;
    mul r13 1000000u128 into r14;
    add r12 r14 into r15;
    cast r3 into r16 as u128;
    add r15 r16 into r17;
    hash.bhp256 r17 into r18 as field;
    async attest_income r0 r18 into r19;
    output r10 as IncomeProof.record;
    output r19 as credaris_core_v2.aleo/attest_income.future;

finalize attest_income:
    input r0 as address.public;
    input r1 as field.public;
    set r1 into income_commitments[r0];
    get.or_use attestation_count[r0] 0u64 into r2;
    add r2 1u64 into r3;
    set r3 into attestation_count[r0];

function compute_score:
    input r0 as u64.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u32.private;
    input r4 as u64.private;
    input r5 as u64.private;
    input r6 as u64.private;
    input r7 as u32.private;
    div r0 r1 into r8;
    assert.eq r2 r8;
    mul r1 5u64 into r9;
    lt r9 200u64 into r10;
    ternary r10 r9 200u64 into r11;
    gte r2 10000000u64 into r12;
    gte r2 5000000u64 into r13;
    gte r2 1000000u64 into r14;
    gte r2 100000u64 into r15;
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
    gt r29 850u64 into r30;
    ternary r30 850u64 r29 into r31;
    gte r31 700u64 into r32;
    gte r31 600u64 into r33;
    gte r31 500u64 into r34;
    ternary r34 3u8 4u8 into r35;
    ternary r33 2u8 r35 into r36;
    ternary r32 1u8 r36 into r37;
    cast self.signer r31 r20 r23 r24 r37 r7 into r38 as CreditReport.record;
    cast r31 into r39 as u128;
    hash.bhp256 r39 into r40 as field;
    async compute_score r0 r1 r2 self.signer r4 r5 r6 r40 r37 into r41;
    output r38 as CreditReport.record;
    output r41 as credaris_core_v2.aleo/compute_score.future;

finalize compute_score:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u64.public;
    input r3 as address.public;
    input r4 as u64.public;
    input r5 as u64.public;
    input r6 as u64.public;
    input r7 as field.public;
    input r8 as u8.public;
    cast r0 into r9 as u128;
    mul r9 1000000000000u128 into r10;
    cast r1 into r11 as u128;
    mul r11 1000000u128 into r12;
    add r10 r12 into r13;
    cast r2 into r14 as u128;
    add r13 r14 into r15;
    hash.bhp256 r15 into r16 as field;
    get income_commitments[r3] into r17;
    assert.eq r16 r17;
    get.or_use repayment_count[r3] 0u64 into r18;
    assert.eq r4 r18;
    get.or_use total_repaid[r3] 0u64 into r19;
    assert.eq r5 r19;
    get.or_use missed_payments[r3] 0u64 into r20;
    assert.eq r6 r20;
    set r7 into score_commitments[r3];
    set true into has_score[r3];
    set r8 into credit_tier[r3];

function lock_collateral:
    input r0 as u64.private;
    gt r0 0u64 into r1;
    assert.eq r1 true;
    cast self.signer r0 true into r2 as Collateral.record;
    output r2 as Collateral.record;

function request_loan:
    input r0 as u64.private;
    input r1 as u32.private;
    input r2 as Collateral.record;
    input r3 as field.private;
    assert.eq r2.owner self.signer;
    assert.eq r2.is_locked true;
    gt r0 0u64 into r4;
    assert.eq r4 true;
    gt r1 0u32 into r5;
    assert.eq r5 true;
    cast r0 into r6 as u128;
    hash.bhp256 r6 into r7 as field;
    cast r1 into r8 as u128;
    hash.bhp256 r8 into r9 as field;
    cast r2.amount into r10 as u128;
    hash.bhp256 r10 into r11 as field;
    hash.bhp256 self.signer into r12 as field;
    add r7 r9 into r13;
    hash.bhp256 r13 into r14 as field;
    add r14 r11 into r15;
    hash.bhp256 r15 into r16 as field;
    add r16 r3 into r17;
    hash.bhp256 r17 into r18 as field;
    add r18 r12 into r19;
    hash.bhp256 r19 into r20 as field;
    cast self.signer self.signer r0 r1 r2.amount r20 into r21 as LoanRequest.record;
    async request_loan self.signer r0 r2.amount r20 into r22;
    output r21 as LoanRequest.record;
    output r22 as credaris_core_v2.aleo/request_loan.future;

finalize request_loan:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as u64.public;
    input r3 as field.public;
    get.or_use credit_tier[r0] 0u8 into r4;
    gt r4 0u8 into r5;
    assert.eq r5 true;
    lte r4 3u8 into r6;
    assert.eq r6 true;
    is.eq r4 1u8 into r7;
    is.eq r4 2u8 into r8;
    is.eq r4 3u8 into r9;
    ternary r9 40u64 100u64 into r10;
    ternary r8 25u64 r10 into r11;
    ternary r7 10u64 r11 into r12;
    mul r1 r12 into r13;
    div r13 100u64 into r14;
    gte r2 r14 into r15;
    assert.eq r15 true;
    get.or_use has_active_loan[r0] false into r16;
    not r16 into r17;
    assert.eq r17 true;
    get.or_use request_exists[r3] false into r18;
    not r18 into r19;
    assert.eq r19 true;
    set true into request_exists[r3];
    set r0 into request_borrower[r3];
    set false into request_filled[r3];

function cancel_request:
    input r0 as LoanRequest.record;
    assert.eq r0.borrower self.signer;
    cast r0.borrower r0.collateral false into r1 as Collateral.record;
    async cancel_request r0.request_hash into r2;
    output r1 as Collateral.record;
    output r2 as credaris_core_v2.aleo/cancel_request.future;

finalize cancel_request:
    input r0 as field.public;
    set false into request_exists[r0];
    set true into request_filled[r0];

function approve_loan:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u32.private;
    input r5 as u64.private;
    input r6 as field.private;
    assert.neq self.signer r1;
    gt r2 0u64 into r7;
    assert.eq r7 true;
    lte r3 5000u64 into r8;
    assert.eq r8 true;
    cast r2 into r9 as u128;
    hash.bhp256 r9 into r10 as field;
    cast r4 into r11 as u128;
    hash.bhp256 r11 into r12 as field;
    cast r5 into r13 as u128;
    hash.bhp256 r13 into r14 as field;
    hash.bhp256 r1 into r15 as field;
    add r10 r12 into r16;
    hash.bhp256 r16 into r17 as field;
    add r17 r14 into r18;
    hash.bhp256 r18 into r19 as field;
    add r19 r6 into r20;
    hash.bhp256 r20 into r21 as field;
    add r21 r15 into r22;
    hash.bhp256 r22 into r23 as field;
    assert.eq r23 r0;
    mul r2 r3 into r24;
    div r24 10000u64 into r25;
    add r2 r25 into r26;
    hash.bhp256 self.signer into r27 as field;
    add r0 r27 into r28;
    cast r3 into r29 as u128;
    hash.bhp256 r29 into r30 as field;
    add r28 r30 into r31;
    hash.bhp256 r31 into r32 as field;
    cast r1 r1 self.signer r2 r3 r5 r26 0u64 r4 true r32 into r33 as LoanAgreement.record;
    cast self.signer r1 self.signer r2 r3 r5 r26 0u64 r4 true r32 into r34 as LoanAgreement.record;
    async approve_loan r0 r1 r2 r5 r32 into r35;
    output r33 as LoanAgreement.record;
    output r34 as LoanAgreement.record;
    output r35 as credaris_core_v2.aleo/approve_loan.future;

finalize approve_loan:
    input r0 as field.public;
    input r1 as address.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as field.public;
    get.or_use request_exists[r0] false into r5;
    assert.eq r5 true;
    get.or_use request_filled[r0] false into r6;
    not r6 into r7;
    assert.eq r7 true;
    get request_borrower[r0] into r8;
    assert.eq r8 r1;
    get.or_use credit_tier[r1] 0u8 into r9;
    gt r9 0u8 into r10;
    assert.eq r10 true;
    lte r9 3u8 into r11;
    assert.eq r11 true;
    is.eq r9 1u8 into r12;
    is.eq r9 2u8 into r13;
    is.eq r9 3u8 into r14;
    ternary r14 40u64 100u64 into r15;
    ternary r13 25u64 r15 into r16;
    ternary r12 10u64 r16 into r17;
    mul r2 r17 into r18;
    div r18 100u64 into r19;
    gte r3 r19 into r20;
    assert.eq r20 true;
    get.or_use has_active_loan[r1] false into r21;
    not r21 into r22;
    assert.eq r22 true;
    set true into request_filled[r0];
    set true into loan_active[r4];
    set true into has_active_loan[r1];

function repay_loan:
    input r0 as LoanAgreement.record;
    input r1 as u64.private;
    assert.eq r0.borrower self.signer;
    assert.eq r0.is_active true;
    sub r0.total_due r0.amount_repaid into r2;
    lte r1 r2 into r3;
    assert.eq r3 true;
    add r0.amount_repaid r1 into r4;
    sub r2 r1 into r5;
    gt r5 0u64 into r6;
    cast r0.borrower r0.borrower r0.lender r0.principal r0.interest_rate r0.collateral r0.total_due r4 r0.due_by r6 r0.loan_id into r7 as LoanAgreement.record;
    cast r0.borrower r0.borrower r1 r5 r0.loan_id into r8 as RepaymentReceipt.record;
    ternary r6 0u64 r0.collateral into r9;
    cast r0.borrower r9 false into r10 as Collateral.record;
    async repay_loan r0.borrower r1 r6 r0.loan_id into r11;
    output r7 as LoanAgreement.record;
    output r8 as RepaymentReceipt.record;
    output r10 as Collateral.record;
    output r11 as credaris_core_v2.aleo/repay_loan.future;

finalize repay_loan:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as field.public;
    get.or_use repayment_count[r0] 0u64 into r4;
    add r4 1u64 into r5;
    set r5 into repayment_count[r0];
    get.or_use total_repaid[r0] 0u64 into r6;
    add r6 r1 into r7;
    set r7 into total_repaid[r0];
    not r2 into r8;
    branch.eq r8 false to end_then_0_0;
    set false into loan_active[r3];
    set false into has_active_loan[r0];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;

function claim_default:
    input r0 as LoanAgreement.record;
    input r1 as u32.private;
    assert.eq r0.lender self.signer;
    assert.eq r0.is_active true;
    gte r1 r0.due_by into r2;
    assert.eq r2 true;
    cast r0.lender r0.collateral false into r3 as Collateral.record;
    cast r0.lender r0.borrower r0.lender r0.principal r0.interest_rate r0.collateral r0.total_due r0.amount_repaid r0.due_by false r0.loan_id into r4 as LoanAgreement.record;
    async claim_default r0.loan_id r0.borrower into r5;
    output r4 as LoanAgreement.record;
    output r3 as Collateral.record;
    output r5 as credaris_core_v2.aleo/claim_default.future;

finalize claim_default:
    input r0 as field.public;
    input r1 as address.public;
    set false into loan_active[r0];
    get.or_use missed_payments[r1] 0u64 into r2;
    add r2 1u64 into r3;
    set r3 into missed_payments[r1];

constructor:
    assert.eq edition 0u16;
