import credaris_income_v3.aleo;
import credaris_credit_v4.aleo;
program credaris_lending_v8.aleo;

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

function request_loan:
    input r0 as u64.private;
    input r1 as u32.private;
    input r2 as u64.private;
    input r3 as field.private;
    gt r0 0u64 into r4;
    assert.eq r4 true;
    gt r1 0u32 into r5;
    assert.eq r5 true;
    cast r0 into r6 as u128;
    mul r6 10000000000u128 into r7;
    cast r1 into r8 as u128;
    mul r8 1000000u128 into r9;
    add r7 r9 into r10;
    cast r2 into r11 as u128;
    add r10 r11 into r12;
    hash.bhp256 r12 into r13 as field;
    add r13 r3 into r14;
    hash.bhp256 self.signer into r15 as field;
    add r14 r15 into r16;
    hash.bhp256 r16 into r17 as field;
    cast self.signer self.signer r0 r1 r2 r17 into r18 as LoanRequest.record;
    async request_loan self.signer r17 into r19;
    output r18 as LoanRequest.record;
    output r19 as credaris_lending_v8.aleo/request_loan.future;

finalize request_loan:
    input r0 as address.public;
    input r1 as field.public;
    get.or_use credaris_credit_v4.aleo/credit_tier[r0] 0u8 into r2;
    gt r2 0u8 into r3;
    assert.eq r3 true;
    get.or_use has_active_loan[r0] false into r4;
    not r4 into r5;
    assert.eq r5 true;
    set true into request_exists[r1];
    set r0 into request_borrower[r1];
    set false into request_filled[r1];

function cancel_request:
    input r0 as LoanRequest.record;
    assert.eq r0.borrower self.signer;
    async cancel_request r0.request_hash into r1;
    output r1 as credaris_lending_v8.aleo/cancel_request.future;

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
    input r5 as field.private;
    assert.neq self.signer r1;
    gt r2 0u64 into r6;
    assert.eq r6 true;
    gt r3 0u64 into r7;
    assert.eq r7 true;
    lte r3 5000u64 into r8;
    assert.eq r8 true;
    gt r4 0u32 into r9;
    assert.eq r9 true;
    mul r2 r3 into r10;
    div r10 10000u64 into r11;
    add r2 r11 into r12;
    hash.bhp256 self.signer into r13 as field;
    add r0 r13 into r14;
    add r14 r5 into r15;
    hash.bhp256 r15 into r16 as field;
    cast r1 r1 self.signer r2 r3 r12 0u64 r4 true r16 into r17 as LoanAgreement.record;
    cast self.signer r1 self.signer r2 r3 r12 0u64 r4 true r16 into r18 as LoanAgreement.record;
    async approve_loan r0 r1 r16 into r19;
    output r17 as LoanAgreement.record;
    output r18 as LoanAgreement.record;
    output r19 as credaris_lending_v8.aleo/approve_loan.future;

finalize approve_loan:
    input r0 as field.public;
    input r1 as address.public;
    input r2 as field.public;
    get.or_use request_exists[r0] false into r3;
    assert.eq r3 true;
    get.or_use request_filled[r0] false into r4;
    not r4 into r5;
    assert.eq r5 true;
    get request_borrower[r0] into r6;
    assert.eq r6 r1;
    get.or_use credaris_credit_v4.aleo/credit_tier[r1] 0u8 into r7;
    gt r7 0u8 into r8;
    assert.eq r8 true;
    get.or_use has_active_loan[r1] false into r9;
    not r9 into r10;
    assert.eq r10 true;
    set true into request_filled[r0];
    set true into loan_active[r2];
    set true into has_active_loan[r1];

function repay_loan:
    input r0 as LoanAgreement.record;
    input r1 as u64.private;
    assert.eq r0.borrower self.signer;
    assert.eq r0.is_active true;
    gt r1 0u64 into r2;
    assert.eq r2 true;
    sub r0.total_due r0.amount_repaid into r3;
    lte r1 r3 into r4;
    assert.eq r4 true;
    add r0.amount_repaid r1 into r5;
    sub r3 r1 into r6;
    gt r6 0u64 into r7;
    cast r0.borrower r0.borrower r0.lender r0.principal r0.interest_rate r0.total_due r5 r0.due_by r7 r0.loan_id into r8 as LoanAgreement.record;
    cast r0.borrower r0.borrower r1 r6 r0.loan_id into r9 as RepaymentReceipt.record;
    async repay_loan r7 r0.loan_id r0.borrower into r10;
    output r8 as LoanAgreement.record;
    output r9 as RepaymentReceipt.record;
    output r10 as credaris_lending_v8.aleo/repay_loan.future;

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

constructor:
    assert.eq edition 0u16;
