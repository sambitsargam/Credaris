import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';

export default function LendingPage() {
  const { address, connected, executeTransaction, transactionStatus } = useWallet();
  const [tab, setTab] = useState('request');
  const [loading, setLoading] = useState(false);
  const [txState, setTxState] = useState(null);
  const [loanData, setLoanData] = useState(null);
  const pollRef = useRef(null);

  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('500');
  const [duration, setDuration] = useState('10000');
  const [approveAddr, setApproveAddr] = useState('');
  const [repayAmount, setRepayAmount] = useState('');

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (!connected || !address) return;
    (async () => {
      const [loanCount, totalRepaid, repayCount] = await Promise.all([
        fetchMappingValue('credaris_lending_v5.aleo', 'loan_count', address),
        fetchMappingValue('credaris_lending_v5.aleo', 'total_repaid', address),
        fetchMappingValue('credaris_lending_v5.aleo', 'repayment_count', address),
      ]);
      setLoanData({
        activeLoans: loanCount ? parseInt(String(loanCount).replace('u64', ''), 10) : 0,
        totalRepaid: totalRepaid ? parseInt(String(totalRepaid).replace('u64', ''), 10) : 0,
        repayCount: repayCount ? parseInt(String(repayCount).replace('u64', ''), 10) : 0,
      });
    })();
  }, [address, connected]);

  const waitForTx = (txId) => {
    return new Promise((resolve, reject) => {
      pollRef.current = setInterval(async () => {
        try {
          const res = await transactionStatus(txId);
          if (res && res.status && res.status.toLowerCase() !== 'pending') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            if (res.status.toLowerCase() === 'accepted') resolve(txId);
            else reject(new Error(res.error || res.status));
          }
        } catch (e) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          reject(e);
        }
      }, 3000);
    });
  };

  const handleRequestLoan = async () => {
    if (!connected || !amount) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Submitting loan request...' });
    try {
      const result = await executeTransaction({
        program: 'credaris_lending_v5.aleo',
        function: 'request_loan',
        inputs: [
          `${parseInt(amount)}u64`, 
          `${parseInt(rate)}u64`, 
          `${parseInt(duration)}u32`, 
          `${Math.floor(Math.random() * 1000000000)}field`
        ],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting: ${result.transactionId}` });
        await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `Loan requested! TX: ${result.transactionId}` });
      }
    } catch (err) {
      setTxState({ type: 'err', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="app-layout">
        <div className="card"><div className="empty"><div className="empty-icon">🔗</div><p>Connect your wallet to access lending</p></div></div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">Lending</h1>
        <p className="page-desc">Request, approve, and repay loans on the Aleo blockchain</p>
      </div>

      {loanData && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-icon">📄</div>
            <div className="stat-label">Active Loans</div>
            <div className="stat-val">{loanData.activeLoans}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">💸</div>
            <div className="stat-label">Total Repaid</div>
            <div className="stat-val">{(loanData.totalRepaid / 1_000_000).toFixed(2)} <span style={{ fontSize: 14, color: 'var(--text-3)' }}>credits</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🔄</div>
            <div className="stat-label">Repayments Made</div>
            <div className="stat-val">{loanData.repayCount}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="tabs">
          {['request', 'approve', 'repay'].map(t => (
            <button key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => { setTab(t); setTxState(null); }}>
              {t === 'request' ? '📝 Request' : t === 'approve' ? '✅ Approve' : '💰 Repay'}
            </button>
          ))}
        </div>

        {tab === 'request' && (
          <div style={{ maxWidth: 500 }}>
            <div className="field">
              <label className="field-label">Loan Amount (microcredits)</label>
              <input className="field-input" type="number" placeholder="e.g. 10000000"
                     value={amount} onChange={e => setAmount(e.target.value)} />
              {amount && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{(parseInt(amount || 0) / 1_000_000).toFixed(4)} credits</div>}
            </div>
            <div className="field">
              <label className="field-label">Interest Rate (basis points, max 5000)</label>
              <input className="field-input" type="number" placeholder="e.g. 500 = 5%"
                     value={rate} onChange={e => setRate(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Duration (blocks)</label>
              <input className="field-input" type="number" placeholder="e.g. 10000"
                     value={duration} onChange={e => setDuration(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleRequestLoan} disabled={loading || !amount} style={{ width: '100%' }}>
              {loading ? <><span className="spin"></span>Processing...</> : '📝 Submit Loan Request'}
            </button>
          </div>
        )}

        {tab === 'approve' && (
          <div style={{ maxWidth: 500 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
              To approve a loan, you need the borrower's <code style={{ color: 'var(--indigo-light)' }}>LoanRequest</code> record.
              The borrower must share this record with you off-chain. The <code style={{ color: 'var(--indigo-light)' }}>approve_loan</code> function
              creates two <code style={{ color: 'var(--indigo-light)' }}>LoanAgreement</code> records — one for the borrower and one for the lender.
            </p>
            <div className="preview">
              <div className="row"><span className="row-label">Program</span><span className="mono">credaris_lending_v5.aleo</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Function</span><span className="mono">approve_loan</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Inputs</span><span className="mono">LoanRequest, block</span></div>
            </div>
            <p style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 12 }}>
              Self-lending is prevented by the contract (lender ≠ borrower check).
            </p>
          </div>
        )}

        {tab === 'repay' && (
          <div style={{ maxWidth: 500 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
              Repayments require your <code style={{ color: 'var(--indigo-light)' }}>LoanAgreement</code> record. 
              Each repayment updates on-chain mappings, increments repayment count, and when fully repaid, 
              automatically closes the loan and decrements the active loan counter.
            </p>
            <div className="preview">
              <div className="row"><span className="row-label">Program</span><span className="mono">credaris_lending_v5.aleo</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Function</span><span className="mono">repay_loan</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Inputs</span><span className="mono">LoanAgreement, amount</span></div>
            </div>
            <p style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 12 }}>
              Overpayment is prevented — amount must be ≤ remaining balance.
            </p>
          </div>
        )}

        {txState && (
          <div className={`tx-toast ${txState.type}`} style={{ marginTop: 20 }}>
            {txState.type === 'pending' && <span className="spin"></span>}
            {txState.type === 'ok' && '✅'}
            {txState.type === 'err' && '❌'}
            <span>{txState.msg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
