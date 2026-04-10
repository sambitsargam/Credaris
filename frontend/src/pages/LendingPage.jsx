import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';

export default function LendingPage() {
  const { wallet, address, connected, executeTransaction, transactionStatus, requestRecords, requestRecordPlaintexts, decrypt } = useWallet();
  const [tab, setTab] = useState('request');
  const [loading, setLoading] = useState(false);
  const [txState, setTxState] = useState(null);
  const [loanData, setLoanData] = useState(null);
  const pollRef = useRef(null);

  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('500');
  const [duration, setDuration] = useState('10000');
  const [loanRecordText, setLoanRecordText] = useState('');
  const [lenderAddress, setLenderAddress] = useState('');
  const [agreementRecordText, setAgreementRecordText] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [myRecords, setMyRecords] = useState([]);
  const [fetchingRecords, setFetchingRecords] = useState(false);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (!connected || !address) return;
    (async () => {
      const [loanCount, totalRepaid, repayCount] = await Promise.all([
        fetchMappingValue('credaris_lending_v6.aleo', 'loan_count', address),
        fetchMappingValue('credaris_lending_v6.aleo', 'total_repaid', address),
        fetchMappingValue('credaris_lending_v6.aleo', 'repayment_count', address),
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

  const handleFetchRecords = async () => {
    if (!connected) return;
    setFetchingRecords(true);
    setTxState({ type: 'pending', msg: 'Fetching and decrypting your lending records...' });
    try {
      const found = [];
      
      const identifyRecord = (str) => {
        if (str.includes('request_id')) return 'LoanRequest';
        if (str.includes('loan_id')) return 'LoanAgreement';
        if (str.includes('remaining')) return 'RepaymentReceipt';
        return 'Unknown';
      };

      if (requestRecordPlaintexts) {
        let plaintexts;
        try { plaintexts = await requestRecordPlaintexts('credaris_lending_v6.aleo'); } catch(e){}
        if (plaintexts) {
          plaintexts.forEach(pt => {
            const str = typeof pt === 'string' ? pt : JSON.stringify(pt);
            const type = identifyRecord(str);
            if (type !== 'Unknown') found.push({ type, text: str });
          });
        }
      }

      if (found.length === 0 && requestRecords) {
        const recs = await requestRecords('credaris_lending_v6.aleo');
        if (recs) {
          for (const rec of recs) {
            const ciphertext = rec.recordCiphertext || rec.ciphertext;
            if (ciphertext) {
              let plaintext = null;
              if (typeof decrypt === 'function') { try { plaintext = await decrypt(ciphertext); } catch(e){} }
              if (!plaintext && typeof wallet?.decrypt === 'function') { try { plaintext = await wallet.decrypt(ciphertext); } catch(e){} }
              if (!plaintext && typeof wallet?.adapter?.decrypt === 'function') { try { plaintext = await wallet.adapter.decrypt(ciphertext); } catch(e){} }
              
              if (plaintext) {
                const str = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
                const type = rec.recordName || identifyRecord(str);
                if (type !== 'Unknown') found.push({ type, text: str });
              }
            } else {
              const str = typeof rec.plaintext === 'string' ? rec.plaintext : JSON.stringify(rec);
              const type = rec.recordName || identifyRecord(str);
              if (type !== 'Unknown' && str.includes('owner')) found.push({ type, text: str });
            }
          }
        }
      }
      
      // Deduplicate if needed (sometimes multiple identical plaintexts show up)
      const uniqueFound = [];
      const seen = new Set();
      for (const f of found) {
        if (!seen.has(f.text)) {
          seen.add(f.text);
          uniqueFound.push(f);
        }
      }

      setMyRecords(uniqueFound);
      setTxState({ type: 'ok', msg: `Fetched ${uniqueFound.length} lending records.` });
    } catch (e) {
      setTxState({ type: 'err', msg: 'Failed to fetch records: ' + e.message });
    } finally {
      setFetchingRecords(false);
    }
  };

  const handleRequestLoan = async () => {
    if (!connected || !amount) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Submitting loan request...' });
    try {
      const result = await executeTransaction({
        program: 'credaris_lending_v6.aleo',
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

  const handleApproveLoan = async () => {
    if (!connected || !loanRecordText || !lenderAddress) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Submitting loan approval...' });
    try {
      const res = await fetch('https://api.explorer.provable.com/v1/testnet/latest/height');
      const currentBlock = parseInt(await res.text(), 10);
      const result = await executeTransaction({
        program: 'credaris_lending_v6.aleo',
        function: 'approve_loan',
        inputs: [loanRecordText, lenderAddress, `${currentBlock}u32`],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting: ${result.transactionId}` });
        await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `Loan approved! TX: ${result.transactionId}` });
      }
    } catch (err) {
      setTxState({ type: 'err', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRepayLoan = async () => {
    if (!connected || !agreementRecordText || !repayAmount) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Submitting repayment...' });
    try {
      const result = await executeTransaction({
        program: 'credaris_lending_v6.aleo',
        function: 'repay_loan',
        inputs: [agreementRecordText, `${parseInt(repayAmount)}u64`],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting: ${result.transactionId}` });
        await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `Repayment successful! TX: ${result.transactionId}` });
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
            <div className="preview" style={{ marginBottom: 16 }}>
              <div className="row"><span className="row-label">Program</span><span className="mono">credaris_lending_v6.aleo</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Function</span><span className="mono">approve_loan</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Inputs</span><span className="mono">LoanRequest, lender, block</span></div>
            </div>
            <div className="field">
              <label className="field-label">LoanRequest Record (Plaintext)</label>
              <textarea className="field-input" rows="4" placeholder="{ owner: aleo1..., amount: 10000000u64.private, ... }"
                        value={loanRecordText} onChange={e => setLoanRecordText(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div className="field">
              <label className="field-label">Lender's Address</label>
              <input className="field-input" type="text" placeholder="aleo1..."
                     value={lenderAddress} onChange={e => setLenderAddress(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleApproveLoan} disabled={loading || !loanRecordText || !lenderAddress} style={{ width: '100%', marginTop: 8 }}>
              {loading ? <><span className="spin"></span>Processing...</> : '✅ Approve Loan'}
            </button>
          </div>
        )}

        {tab === 'repay' && (
          <div style={{ maxWidth: 500 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
              Repayments require your <code style={{ color: 'var(--indigo-light)' }}>LoanAgreement</code> record. 
              Each repayment updates on-chain mappings, increments repayment count, and when fully repaid, 
              automatically closes the loan and decrements the active loan counter.
            </p>
            <div className="preview" style={{ marginBottom: 16 }}>
              <div className="row"><span className="row-label">Program</span><span className="mono">credaris_lending_v6.aleo</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Function</span><span className="mono">repay_loan</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Inputs</span><span className="mono">LoanAgreement, amount</span></div>
            </div>
            <div className="field">
              <label className="field-label">LoanAgreement Record (Plaintext)</label>
              <textarea className="field-input" rows="4" placeholder="{ owner: aleo1..., principal: 10000000u64.private, ... }"
                        value={agreementRecordText} onChange={e => setAgreementRecordText(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div className="field">
              <label className="field-label">Repayment Amount (microcredits)</label>
              <input className="field-input" type="number" placeholder="e.g. 5000000"
                     value={repayAmount} onChange={e => setRepayAmount(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleRepayLoan} disabled={loading || !agreementRecordText || !repayAmount} style={{ width: '100%', marginTop: 8 }}>
              {loading ? <><span className="spin"></span>Processing...</> : '💰 Submit Repayment'}
            </button>
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

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">My Private Lending Records</div>
          <button className="btn btn-ghost" onClick={handleFetchRecords} disabled={fetchingRecords}>
            {fetchingRecords ? 'Decrypting...' : '↻ Refresh Encrypted Records'}
          </button>
        </div>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 16 }}>
          Retrieve your newly minted private records (LoanRequest and LoanAgreement) here so they can be copy-pasted into the executor above.
        </p>
        
        {myRecords.length === 0 ? (
           <div className="empty" style={{ padding: '20px 0' }}><p>No records fetched yet.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {myRecords.map((r, i) => (
              <div key={i} style={{ padding: 12, background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: r.type === 'LoanRequest' ? 'var(--indigo-light)' : 'var(--emerald)' }}>
                  {r.type}
                </div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', wordBreak: 'break-all' }}>
                  {r.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
