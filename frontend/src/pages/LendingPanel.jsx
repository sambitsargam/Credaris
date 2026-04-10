import React, { useState } from 'react';
import { requestLoan, approveLoan, repayLoan } from '../services/aleoProgram';

export default function LendingPanel({ wallet, address }) {
  const [activeTab, setActiveTab] = useState('request');
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState(null);

  const [loanForm, setLoanForm] = useState({ amount: '', interestRate: '500', duration: '100000' });
  const [approveForm, setApproveForm] = useState({ loanRecord: '', currentBlock: '' });
  const [repayForm, setRepayForm] = useState({ agreementRecord: '', amount: '' });

  const handleRequestLoan = async () => {
    if (!wallet || !address) return;
    setLoading(true);
    setTxStatus({ status: 'pending', message: 'Submitting loan request...' });
    try {
      const txId = await requestLoan(wallet, {
        borrower: address,
        amount: parseInt(loanForm.amount),
        interestRate: parseInt(loanForm.interestRate),
        duration: parseInt(loanForm.duration),
      });
      setTxStatus({ status: 'confirmed', message: `Loan requested: ${txId}` });
    } catch (err) {
      setTxStatus({ status: 'failed', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveLoan = async () => {
    if (!wallet || !address) return;
    setLoading(true);
    setTxStatus({ status: 'pending', message: 'Approving loan...' });
    try {
      const txId = await approveLoan(wallet, {
        loanRequest: approveForm.loanRecord,
        lender: address,
        currentBlock: parseInt(approveForm.currentBlock),
      });
      setTxStatus({ status: 'confirmed', message: `Loan approved: ${txId}` });
    } catch (err) {
      setTxStatus({ status: 'failed', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRepayLoan = async () => {
    if (!wallet || !address) return;
    setLoading(true);
    setTxStatus({ status: 'pending', message: 'Processing repayment...' });
    try {
      const txId = await repayLoan(wallet, {
        agreement: repayForm.agreementRecord,
        amount: parseInt(repayForm.amount),
      });
      setTxStatus({ status: 'confirmed', message: `Repayment confirmed: ${txId}` });
    } catch (err) {
      setTxStatus({ status: 'failed', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (!address) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">🔗</div>
          <p>Connect your wallet to manage loans</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Lending</h2>
        <p className="section-desc">Request, approve, and repay loans with on-chain enforcement</p>
      </div>

      <div className="card">
        <div className="tabs">
          <button className={`tab ${activeTab === 'request' ? 'active' : ''}`} onClick={() => { setActiveTab('request'); setTxStatus(null); }}>
            📝 Request
          </button>
          <button className={`tab ${activeTab === 'approve' ? 'active' : ''}`} onClick={() => { setActiveTab('approve'); setTxStatus(null); }}>
            ✅ Approve
          </button>
          <button className={`tab ${activeTab === 'repay' ? 'active' : ''}`} onClick={() => { setActiveTab('repay'); setTxStatus(null); }}>
            💰 Repay
          </button>
        </div>

        {activeTab === 'request' && (
          <div>
            <div className="form-group">
              <label className="form-label">Loan Amount (microcredits)</label>
              <input className="form-input" type="number" placeholder="e.g. 1000000"
                value={loanForm.amount} onChange={e => setLoanForm({ ...loanForm, amount: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Interest Rate (basis points, 500 = 5%)</label>
              <input className="form-input" type="number" placeholder="500"
                value={loanForm.interestRate} onChange={e => setLoanForm({ ...loanForm, interestRate: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Duration (blocks)</label>
              <input className="form-input" type="number" placeholder="100000"
                value={loanForm.duration} onChange={e => setLoanForm({ ...loanForm, duration: e.target.value })} />
            </div>

            {loanForm.amount && (
              <div style={{ padding: '12px 16px', background: 'var(--glass)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                Total Due: {((parseInt(loanForm.amount || 0) * (1 + parseInt(loanForm.interestRate || 0) / 10000)) / 1_000_000).toFixed(4)} credits
                ({(parseInt(loanForm.interestRate || 0) / 100).toFixed(2)}% interest)
              </div>
            )}

            <button className="btn btn-primary" onClick={handleRequestLoan} disabled={loading || !loanForm.amount} style={{ width: '100%' }}>
              {loading ? <><span className="spinner"></span> Submitting...</> : '📝 Request Loan'}
            </button>
          </div>
        )}

        {activeTab === 'approve' && (
          <div>
            <div className="form-group">
              <label className="form-label">LoanRequest Record (paste full record)</label>
              <textarea className="form-input" rows={5} placeholder='{ owner: aleo1..., borrower: aleo1..., ... }'
                value={approveForm.loanRecord} onChange={e => setApproveForm({ ...approveForm, loanRecord: e.target.value })}
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Current Block Height</label>
              <input className="form-input" type="number" placeholder="e.g. 500000"
                value={approveForm.currentBlock} onChange={e => setApproveForm({ ...approveForm, currentBlock: e.target.value })} />
            </div>

            <button className="btn btn-primary" onClick={handleApproveLoan} disabled={loading || !approveForm.loanRecord} style={{ width: '100%' }}>
              {loading ? <><span className="spinner"></span> Approving...</> : '✅ Approve Loan'}
            </button>
          </div>
        )}

        {activeTab === 'repay' && (
          <div>
            <div className="form-group">
              <label className="form-label">LoanAgreement Record (paste full record)</label>
              <textarea className="form-input" rows={5} placeholder='{ owner: aleo1..., borrower: aleo1..., ... }'
                value={repayForm.agreementRecord} onChange={e => setRepayForm({ ...repayForm, agreementRecord: e.target.value })}
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Repayment Amount (microcredits)</label>
              <input className="form-input" type="number" placeholder="e.g. 500000"
                value={repayForm.amount} onChange={e => setRepayForm({ ...repayForm, amount: e.target.value })} />
            </div>

            <button className="btn btn-primary" onClick={handleRepayLoan} disabled={loading || !repayForm.amount} style={{ width: '100%' }}>
              {loading ? <><span className="spinner"></span> Repaying...</> : '💰 Repay Loan'}
            </button>
          </div>
        )}

        {txStatus && (
          <div className={`tx-status ${txStatus.status}`}>
            {txStatus.status === 'pending' && <span className="spinner"></span>}
            {txStatus.status === 'confirmed' && <span>✅</span>}
            {txStatus.status === 'failed' && <span>❌</span>}
            <span style={{ fontSize: 13 }}>{txStatus.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
