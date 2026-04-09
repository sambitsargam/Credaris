program credaris_lending_v1.aleo;

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
    approved_at as u32.private;
    due_by as u32.private;
    is_active as boolean.private;
    loan_id as field.private;

record RepaymentReceipt:
    owner as address.private;
    borrower as address.private;
    amount_paid as u64.private;
    remaining as u64.private;
    loan_id as field.private;

mapping active_loans:
    key as field.public;
    value as u64.public;

mapping loan_count:
    key as address.public;
    value as u64.public;

mapping total_repaid:
    key as address.public;
    value as u64.public;

mapping repayment_count:
    key as address.public;
    value as u64.public;

function request_loan:
    input r0 as address.private;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u32.private;
    assert.eq r0 self.signer;
    gt r1 0u64 into r4;
    assert.eq r4 true;
    lte r1 1000000000u64 into r5;
    assert.eq r5 true;
    gt r2 0u64 into r6;
    assert.eq r6 true;
    lte r2 5000u64 into r7;
    assert.eq r7 true;
    gt r3 0u32 into r8;
    assert.eq r8 true;
    hash.bhp256 r0 into r9 as field;
    cast r0 r0 r1 r2 r3 r9 into r10 as LoanRequest.record;
    output r10 as LoanRequest.record;

function approve_loan:
    input r0 as LoanRequest.record;
    input r1 as address.private;
    input r2 as u32.private;
    assert.eq r1 self.signer;
    is.eq r1 r0.borrower into r3;
    not r3 into r4;
    assert.eq r4 true;
    mul r0.amount r0.interest_rate into r5;
    div r5 10000u64 into r6;
    add r0.amount r6 into r7;
    add r2 r0.duration into r8;
    hash.bhp256 r0.request_id into r9 as field;
    cast r0.borrower r0.borrower r1 r0.amount r0.interest_rate r7 0u64 r2 r8 true r9 into r10 as LoanAgreement.record;
    cast r1 r0.borrower r1 r0.amount r0.interest_rate r7 0u64 r2 r8 true r9 into r11 as LoanAgreement.record;
    async approve_loan r9 r7 r0.borrower into r12;
    output r10 as LoanAgreement.record;
    output r11 as LoanAgreement.record;
    output r12 as credaris_lending_v1.aleo/approve_loan.future;

finalize approve_loan:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as address.public;
    set r1 into active_loans[r0];
    get.or_use loan_count[r2] 0u64 into r3;
    add r3 1u64 into r4;
    set r4 into loan_count[r2];

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
    cast r0.borrower r0.borrower r0.lender r0.principal r0.interest_rate r0.total_due r5 r0.approved_at r0.due_by r7 r0.loan_id into r8 as LoanAgreement.record;
    cast r0.borrower r0.borrower r1 r6 r0.loan_id into r9 as RepaymentReceipt.record;
    async repay_loan r0.loan_id r6 r0.borrower r1 r7 into r10;
    output r8 as LoanAgreement.record;
    output r9 as RepaymentReceipt.record;
    output r10 as credaris_lending_v1.aleo/repay_loan.future;

finalize repay_loan:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as address.public;
    input r3 as u64.public;
    input r4 as boolean.public;
    set r1 into active_loans[r0];
    get.or_use total_repaid[r2] 0u64 into r5;
    add r5 r3 into r6;
    set r6 into total_repaid[r2];
    get.or_use repayment_count[r2] 0u64 into r7;
    add r7 1u64 into r8;
    set r8 into repayment_count[r2];
    not r4 into r9;
    branch.eq r9 false to end_then_0_0;
    get.or_use loan_count[r2] 0u64 into r10;
    gt r10 0u64 into r11;
    sub r10 1u64 into r12;
    ternary r11 r12 0u64 into r13;
    set r13 into loan_count[r2];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;

constructor:
    assert.eq edition 0u16;
