import credaris_income_v3.aleo;
import credaris_credit_v4.aleo;
program credaris_lending_v10.aleo;

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
    add r13 r11 into r14;
    add r14 r3 into r15;
    add r15 r12 into r16;
    hash.bhp256 r16 into r17 as field;
    cast self.signer self.signer r0 r1 r2.amount r17 into r18 as LoanRequest.record;
    async request_loan self.signer r0 r2.amount r17 into r19;
    output r18 as LoanRequest.record;
    output r19 as credaris_lending_v10.aleo/request_loan.future;

finalize request_loan:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as u64.public;
    input r3 as field.public;
    get.or_use credaris_credit_v4.aleo/credit_tier[r0] 0u8 into r4;
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
    set true into request_exists[r3];
    set r0 into request_borrower[r3];
    set false into request_filled[r3];

function cancel_request:
    input r0 as LoanRequest.record;
    assert.eq r0.borrower self.signer;
    cast r0.borrower r0.collateral false into r1 as Collateral.record;
    async cancel_request r0.request_hash into r2;
    output r1 as Collateral.record;
    output r2 as credaris_lending_v10.aleo/cancel_request.future;

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
    add r16 r14 into r17;
    add r17 r6 into r18;
    add r18 r15 into r19;
    hash.bhp256 r19 into r20 as field;
    assert.eq r20 r0;
    mul r2 r3 into r21;
    div r21 10000u64 into r22;
    add r2 r22 into r23;
    hash.bhp256 self.signer into r24 as field;
    add r0 r24 into r25;
    cast r3 into r26 as u128;
    hash.bhp256 r26 into r27 as field;
    add r25 r27 into r28;
    hash.bhp256 r28 into r29 as field;
    cast r1 r1 self.signer r2 r3 r5 r23 0u64 r4 true r29 into r30 as LoanAgreement.record;
    cast self.signer r1 self.signer r2 r3 r5 r23 0u64 r4 true r29 into r31 as LoanAgreement.record;
    async approve_loan r0 r1 r2 r5 r29 into r32;
    output r30 as LoanAgreement.record;
    output r31 as LoanAgreement.record;
    output r32 as credaris_lending_v10.aleo/approve_loan.future;

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
    get.or_use credaris_credit_v4.aleo/credit_tier[r1] 0u8 into r9;
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
    async repay_loan r6 r0.loan_id r0.borrower into r11;
    output r7 as LoanAgreement.record;
    output r8 as RepaymentReceipt.record;
    output r10 as Collateral.record;
    output r11 as credaris_lending_v10.aleo/repay_loan.future;

finalize repay_loan:
    input r0 as boolean.public;
    input r1 as field.public;
    input r2 as address.public;
    not r0 into r3;
    branch.eq r3 false to end_then_0_0;
    set false into loan_active[r1];
    set false into has_active_loan[r2];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;

function claim_default:
    input r0 as LoanAgreement.record;
    assert.eq r0.lender self.signer;
    assert.eq r0.is_active true;
    cast r0.lender r0.collateral false into r1 as Collateral.record;
    cast r0.lender r0.borrower r0.lender r0.principal r0.interest_rate r0.collateral r0.total_due r0.amount_repaid r0.due_by false r0.loan_id into r2 as LoanAgreement.record;
    async claim_default r0.loan_id into r3;
    output r2 as LoanAgreement.record;
    output r1 as Collateral.record;
    output r3 as credaris_lending_v10.aleo/claim_default.future;

finalize claim_default:
    input r0 as field.public;
    set false into loan_active[r0];

constructor:
    assert.eq edition 0u16;
