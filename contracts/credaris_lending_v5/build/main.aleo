import credaris_income_v3.aleo;
import credaris_credit_v3.aleo;
program credaris_lending_v5.aleo;

record LoanRequest:
    owner as address.private;
    borrower as address.private;
    amount as u64.private;
    interest_rate as u64.private;
    duration as u32.private;
    request_id as field.private;

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

mapping loan_active:
    key as field.public;
    value as boolean.public;

mapping has_active_loan:
    key as address.public;
    value as boolean.public;

function request_loan:
    input r0 as u64.private;
    input r1 as u64.private;
    input r2 as u32.private;
    input r3 as field.private;
    gt r0 0u64 into r4;
    assert.eq r4 true;
    gt r1 0u64 into r5;
    assert.eq r5 true;
    lte r1 5000u64 into r6;
    assert.eq r6 true;
    gt r2 0u32 into r7;
    assert.eq r7 true;
    cast r0 into r8 as u128;
    mul r8 10000000000u128 into r9;
    cast r1 into r10 as u128;
    mul r10 1000000u128 into r11;
    add r9 r11 into r12;
    cast r2 into r13 as u128;
    add r12 r13 into r14;
    hash.bhp256 r14 into r15 as field;
    add r15 r3 into r16;
    hash.bhp256 r16 into r17 as field;
    cast self.signer self.signer r0 r1 r2 r17 into r18 as LoanRequest.record;
    async request_loan self.signer into r19;
    output r18 as LoanRequest.record;
    output r19 as credaris_lending_v5.aleo/request_loan.future;

finalize request_loan:
    input r0 as address.public;
    get.or_use credaris_credit_v3.aleo/has_score[r0] false into r1;
    assert.eq r1 true;
    get.or_use has_active_loan[r0] false into r2;
    not r2 into r3;
    assert.eq r3 true;

function approve_loan:
    input r0 as LoanRequest.record;
    input r1 as u32.private;
    assert.neq self.signer r0.borrower;
    mul r0.amount r0.interest_rate into r2;
    div r2 10000u64 into r3;
    add r0.amount r3 into r4;
    add r1 r0.duration into r5;
    hash.bhp256 self.signer into r6 as field;
    add r0.request_id r6 into r7;
    cast r1 into r8 as u128;
    hash.bhp256 r8 into r9 as field;
    add r7 r9 into r10;
    hash.bhp256 r10 into r11 as field;
    cast r0.borrower r0.borrower self.signer r0.amount r0.interest_rate r4 0u64 r5 true r11 into r12 as LoanAgreement.record;
    cast self.signer r0.borrower self.signer r0.amount r0.interest_rate r4 0u64 r5 true r11 into r13 as LoanAgreement.record;
    async approve_loan r11 r0.borrower into r14;
    output r12 as LoanAgreement.record;
    output r13 as LoanAgreement.record;
    output r14 as credaris_lending_v5.aleo/approve_loan.future;

finalize approve_loan:
    input r0 as field.public;
    input r1 as address.public;
    set true into loan_active[r0];
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
    output r10 as credaris_lending_v5.aleo/repay_loan.future;

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
