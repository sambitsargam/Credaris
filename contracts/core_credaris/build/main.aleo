import credits.aleo;
program core_credaris.aleo;

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

mapping locked_collateral:
    key as address.public;
    value as u64.public;

mapping loan_collateral:
    key as field.public;
    value as u64.public;

mapping request_collateral:
    key as field.public;
    value as u64.public;

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
    output r19 as core_credaris.aleo/attest_income.future;

finalize attest_income:
    input r0 as address.public;
    input r1 as field.public;
    set r1 into income_commitments[r0];
    get.or_use attestation_count[r0] 0u64 into r2;
    add r2 1u64 into r3;
    set r3 into attestation_count[r0];

function compute_score:
    input r0 as address.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u64.private;
    input r5 as u64.private;
    input r6 as u32.private;
    gte r2 50u64 into r7;
    gte r2 25u64 into r8;
    gte r2 5u64 into r9;
    gte r2 1u64 into r10;
    ternary r10 50u64 0u64 into r11;
    ternary r9 100u64 r11 into r12;
    ternary r8 150u64 r12 into r13;
    ternary r7 200u64 r13 into r14;
    gte r3 1000000000u64 into r15;
    gte r3 500000000u64 into r16;
    gte r3 100000000u64 into r17;
    gte r3 10000000u64 into r18;
    ternary r18 25u64 0u64 into r19;
    ternary r17 75u64 r19 into r20;
    ternary r16 100u64 r20 into r21;
    ternary r15 150u64 r21 into r22;
    gte r4 10u64 into r23;
    gte r4 5u64 into r24;
    gte r4 1u64 into r25;
    ternary r25 100u64 0u64 into r26;
    ternary r24 150u64 r26 into r27;
    ternary r23 200u64 r27 into r28;
    mul r5 50u64 into r29;
    add 300u64 r14 into r30;
    add r30 r22 into r31;
    add r31 r28 into r32;
    gt r32 r29 into r33;
    sub r32 r29 into r34;
    ternary r33 r34 300u64 into r35;
    gt r35 850u64 into r36;
    ternary r36 850u64 r35 into r37;
    gte r37 750u64 into r38;
    gte r37 650u64 into r39;
    gte r37 500u64 into r40;
    ternary r40 3u8 4u8 into r41;
    ternary r39 2u8 r41 into r42;
    ternary r38 1u8 r42 into r43;
    cast r0 r37 r14 r28 r29 r43 r6 into r44 as CreditReport.record;
    cast r1 into r45 as u128;
    mul r45 1000000000000u128 into r46;
    cast r2 into r47 as u128;
    mul r47 1000000u128 into r48;
    add r46 r48 into r49;
    cast r3 into r50 as u128;
    add r49 r50 into r51;
    hash.bhp256 r51 into r52 as field;
    cast r37 into r53 as u128;
    mul r53 1000000u128 into r54;
    cast r6 into r55 as u128;
    add r54 r55 into r56;
    hash.bhp256 r56 into r57 as field;
    async compute_score r0 r52 r4 r5 r57 r43 into r58;
    output r44 as CreditReport.record;
    output r58 as core_credaris.aleo/compute_score.future;

finalize compute_score:
    input r0 as address.public;
    input r1 as field.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as field.public;
    input r5 as u8.public;
    get income_commitments[r0] into r6;
    assert.eq r1 r6;
    get.or_use repayment_count[r0] 0u64 into r7;
    assert.eq r7 r2;
    get.or_use missed_payments[r0] 0u64 into r8;
    assert.eq r8 r3;
    set r4 into score_commitments[r0];
    set true into has_score[r0];
    set r5 into credit_tier[r0];

function lock_collateral:
    input r0 as u64.private;
    gt r0 0u64 into r1;
    assert.eq r1 true;
    call credits.aleo/transfer_public_as_signer core_credaris.aleo r0 into r2;
    async lock_collateral r2 self.signer r0 into r3;
    output r3 as core_credaris.aleo/lock_collateral.future;

finalize lock_collateral:
    input r0 as credits.aleo/transfer_public_as_signer.future;
    input r1 as address.public;
    input r2 as u64.public;
    await r0;
    get.or_use has_active_loan[r1] false into r3;
    not r3 into r4;
    assert.eq r4 true;
    get.or_use locked_collateral[r1] 0u64 into r5;
    add r5 r2 into r6;
    set r6 into locked_collateral[r1];

function unlock_collateral:
    input r0 as u64.private;
    gt r0 0u64 into r1;
    assert.eq r1 true;
    call credits.aleo/transfer_public self.signer r0 into r2;
    async unlock_collateral r2 self.signer r0 into r3;
    output r3 as core_credaris.aleo/unlock_collateral.future;

finalize unlock_collateral:
    input r0 as credits.aleo/transfer_public.future;
    input r1 as address.public;
    input r2 as u64.public;
    await r0;
    get.or_use has_active_loan[r1] false into r3;
    not r3 into r4;
    assert.eq r4 true;
    get locked_collateral[r1] into r5;
    gte r5 r2 into r6;
    assert.eq r6 true;
    sub r5 r2 into r7;
    set r7 into locked_collateral[r1];

function request_loan:
    input r0 as u64.private;
    input r1 as u32.private;
    input r2 as u64.private;
    input r3 as field.private;
    gt r0 0u64 into r4;
    assert.eq r4 true;
    gt r1 0u32 into r5;
    assert.eq r5 true;
    gt r2 0u64 into r6;
    assert.eq r6 true;
    cast r0 into r7 as u128;
    hash.bhp256 r7 into r8 as field;
    cast r1 into r9 as u128;
    hash.bhp256 r9 into r10 as field;
    cast r2 into r11 as u128;
    hash.bhp256 r11 into r12 as field;
    hash.bhp256 self.signer into r13 as field;
    add r8 r10 into r14;
    hash.bhp256 r14 into r15 as field;
    add r15 r12 into r16;
    hash.bhp256 r16 into r17 as field;
    add r17 r3 into r18;
    hash.bhp256 r18 into r19 as field;
    add r19 r13 into r20;
    hash.bhp256 r20 into r21 as field;
    cast self.signer self.signer r0 r1 r2 r21 into r22 as LoanRequest.record;
    async request_loan self.signer r0 r2 r21 into r23;
    output r22 as LoanRequest.record;
    output r23 as core_credaris.aleo/request_loan.future;

finalize request_loan:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as u64.public;
    input r3 as field.public;
    get.or_use credit_tier[r0] 0u8 into r4;
    gt r4 0u8 into r5;
    assert.eq r5 true;
    is.eq r4 1u8 into r6;
    is.eq r4 2u8 into r7;
    is.eq r4 3u8 into r8;
    ternary r8 40u64 200u64 into r9;
    ternary r7 25u64 r9 into r10;
    ternary r6 10u64 r10 into r11;
    mul r1 r11 into r12;
    div r12 100u64 into r13;
    get locked_collateral[r0] into r14;
    gte r14 r2 into r15;
    assert.eq r15 true;
    gte r2 r13 into r16;
    assert.eq r16 true;
    get.or_use has_active_loan[r0] false into r17;
    not r17 into r18;
    assert.eq r18 true;
    sub r14 r2 into r19;
    set r19 into locked_collateral[r0];
    set r2 into request_collateral[r3];
    set r0 into request_borrower[r3];
    set false into request_filled[r3];

function cancel_request:
    input r0 as LoanRequest.record;
    assert.eq r0.borrower self.signer;
    async cancel_request r0.request_hash r0.borrower into r1;
    output r1 as core_credaris.aleo/cancel_request.future;

finalize cancel_request:
    input r0 as field.public;
    input r1 as address.public;
    get request_collateral[r0] into r2;
    get request_borrower[r0] into r3;
    assert.eq r3 r1;
    get.or_use request_filled[r0] false into r4;
    not r4 into r5;
    assert.eq r5 true;
    set 0u64 into request_collateral[r0];
    set true into request_filled[r0];
    get.or_use locked_collateral[r1] 0u64 into r6;
    add r6 r2 into r7;
    set r7 into locked_collateral[r1];

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
    call credits.aleo/transfer_public r1 r2 into r35;
    async approve_loan r35 r0 r5 r1 r32 into r36;
    output r33 as LoanAgreement.record;
    output r34 as LoanAgreement.record;
    output r36 as core_credaris.aleo/approve_loan.future;

finalize approve_loan:
    input r0 as credits.aleo/transfer_public.future;
    input r1 as field.public;
    input r2 as u64.public;
    input r3 as address.public;
    input r4 as field.public;
    await r0;
    get request_collateral[r1] into r5;
    assert.eq r5 r2;
    get.or_use request_filled[r1] false into r6;
    not r6 into r7;
    assert.eq r7 true;
    get request_borrower[r1] into r8;
    assert.eq r8 r3;
    get.or_use has_active_loan[r3] false into r9;
    not r9 into r10;
    assert.eq r10 true;
    set true into request_filled[r1];
    set 0u64 into request_collateral[r1];
    set true into loan_active[r4];
    set true into has_active_loan[r3];
    set r2 into loan_collateral[r4];

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
    mul r1 250u64 into r9;
    div r9 10000u64 into r10;
    sub r1 r10 into r11;
    call credits.aleo/transfer_public_as_signer r0.lender r11 into r12;
    call credits.aleo/transfer_public_as_signer aleo16jqhraylf6vqwxks2wv5827rkyn55kre7x3w8mvh8gr4c4ajggqsd2s7jh r10 into r13;
    async repay_loan r12 r13 r0.borrower r1 r6 r0.loan_id into r14;
    output r7 as LoanAgreement.record;
    output r8 as RepaymentReceipt.record;
    output r14 as core_credaris.aleo/repay_loan.future;

finalize repay_loan:
    input r0 as credits.aleo/transfer_public_as_signer.future;
    input r1 as credits.aleo/transfer_public_as_signer.future;
    input r2 as address.public;
    input r3 as u64.public;
    input r4 as boolean.public;
    input r5 as field.public;
    await r0;
    await r1;
    get.or_use repayment_count[r2] 0u64 into r6;
    add r6 1u64 into r7;
    set r7 into repayment_count[r2];
    get.or_use total_repaid[r2] 0u64 into r8;
    add r8 r3 into r9;
    set r9 into total_repaid[r2];
    not r4 into r10;
    branch.eq r10 false to end_then_0_0;
    get loan_collateral[r5] into r11;
    set false into loan_active[r5];
    set false into has_active_loan[r2];
    set 0u64 into loan_collateral[r5];
    get.or_use locked_collateral[r2] 0u64 into r12;
    add r12 r11 into r13;
    set r13 into locked_collateral[r2];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;

function claim_default:
    input r0 as LoanAgreement.record;
    assert.eq r0.lender self.signer;
    assert.eq r0.is_active true;
    cast r0.lender r0.borrower r0.lender r0.principal r0.interest_rate r0.collateral r0.total_due r0.amount_repaid r0.due_by false r0.loan_id into r1 as LoanAgreement.record;
    call credits.aleo/transfer_public r0.lender r0.collateral into r2;
    async claim_default r2 r0.due_by r0.loan_id r0.collateral r0.borrower into r3;
    output r1 as LoanAgreement.record;
    output r3 as core_credaris.aleo/claim_default.future;

finalize claim_default:
    input r0 as credits.aleo/transfer_public.future;
    input r1 as u32.public;
    input r2 as field.public;
    input r3 as u64.public;
    input r4 as address.public;
    await r0;
    gte block.height r1 into r5;
    assert.eq r5 true;
    get loan_collateral[r2] into r6;
    assert.eq r6 r3;
    set 0u64 into loan_collateral[r2];
    set false into loan_active[r2];
    set false into has_active_loan[r4];
    get.or_use missed_payments[r4] 0u64 into r7;
    add r7 1u64 into r8;
    set r8 into missed_payments[r4];

constructor:
    assert.eq edition 0u16;
