import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';

const PROGRAM = 'credaris_lending_v8.aleo';
const CREDIT_PROGRAM = 'credaris_credit_v4.aleo';

const TIER_LABELS = { 1: 'A — Low Risk', 2: 'B — Medium Risk', 3: 'C — High Risk', 4: 'D — Very High Risk' };
const TIER_COLORS = { 1: 'var(--emerald)', 2: '#60a5fa', 3: 'var(--amber)', 4: 'var(--rose)' };

export default function LendingPage() {
  const { wallet, address, connected, executeTransaction, transactionStatus, requestRecords, requestRecordPlaintexts, decrypt } = useWallet();
  const [tab, setTab] = useState('marketplace');
  const [loading, setLoading] = useState(false);
  const [txState, setTxState] = useState(null);
  const pollRef = useRef(null);

  // Request state
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('10000');
  const [collateral, setCollateral] = useState('0');

  // Approve state (lender)
  const [approveHash, setApproveHash] = useState('');
  const [approveBorrower, setApproveBorrower] = useState('');
  const [approveAmount, setApproveAmount] = useState('');
  const [approveRate, setApproveRate] = useState('500');
  const [approveDuration, setApproveDuration] = useState('10000');

  // Repay state
  const [agreementRecordText, setAgreementRecordText] = useState('');
  const [repayAmount, setRepayAmount] = useState('');

  // Marketplace data
  const [myRequests, setMyRequests] = useState([]);
  const [fetchingRecords, setFetchingRecords] = useState(false);
  const [borrowerTier, setBorrowerTier] = useState(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Fetch borrower tier for lookup
  const lookupTier = async (addr) => {
    if (!addr) return;
    const tier = await fetchMappingValue(CREDIT_PROGRAM, 'credit_tier', addr);
    if (tier) {
      const val = parseInt(String(tier).replace(/u\d+$/g, ''), 10);
      setBorrowerTier(val);
    } else {
      setBorrowerTier(null);
    }
  };

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

  // ═══════════════════════════════════════════
  // BORROWER: Request a Loan
  // ═══════════════════════════════════════════
  const handleRequestLoan = async () => {
    if (!connected || !amount) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Submitting loan request to marketplace...' });
    try {
      const nonce = `${Math.floor(Math.random() * 1000000000)}field`;
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'request_loan',
        inputs: [
          `${parseInt(amount)}u64`,
          `${parseInt(duration)}u32`,
          `${parseInt(collateral)}u64`,
          nonce,
        ],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting: ${result.transactionId}` });
        await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `Request listed on marketplace! TX: ${result.transactionId}` });
      }
    } catch (err) {
      setTxState({ type: 'err', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // LENDER: Approve/Fund a Loan
  // ═══════════════════════════════════════════
  const handleApproveLoan = async () => {
    if (!connected || !approveHash || !approveBorrower || !approveAmount) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Funding loan request...' });
    try {
      const nonce = `${Math.floor(Math.random() * 1000000000)}field`;
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'approve_loan',
        inputs: [
          approveHash,
          approveBorrower,
          `${parseInt(approveAmount)}u64`,
          `${parseInt(approveRate)}u64`,
          `${parseInt(approveDuration)}u32`,
          nonce,
        ],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting: ${result.transactionId}` });
        await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `Loan funded! TX: ${result.transactionId}` });
      }
    } catch (err) {
      setTxState({ type: 'err', msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // BORROWER: Repay a Loan
  // ═══════════════════════════════════════════
  const handleRepayLoan = async () => {
    if (!connected || !agreementRecordText || !repayAmount) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Submitting repayment...' });
    try {
      const result = await executeTransaction({
        program: PROGRAM,
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

  // ═══════════════════════════════════════════
  // Fetch private records from wallet
  // ═══════════════════════════════════════════
  const handleFetchRecords = async () => {
    if (!connected) return;
    setFetchingRecords(true);
    setTxState({ type: 'pending', msg: 'Fetching your private lending records...' });
    try {
      const found = [];
      const identify = (str) => {
        if (str.includes('request_hash')) return 'LoanRequest';
        if (str.includes('loan_id') && str.includes('principal')) return 'LoanAgreement';
        if (str.includes('remaining') && str.includes('amount_paid')) return 'RepaymentReceipt';
        return 'Unknown';
      };

      if (requestRecords) {
        const recs = await requestRecords(PROGRAM);
        if (recs) {
          for (const rec of recs) {
            const type = rec.recordName || identify(JSON.stringify(rec));
            const text = rec.plaintext || rec.recordPlaintext || JSON.stringify(rec);
            if (type !== 'Unknown') found.push({ type, text: typeof text === 'string' ? text : JSON.stringify(text) });
          }
        }
      }

      const unique = [];
      const seen = new Set();
      for (const f of found) {
        if (!seen.has(f.text)) { seen.add(f.text); unique.push(f); }
      }

      setMyRequests(unique);
      setTxState({ type: 'ok', msg: `Found ${unique.length} private records.` });
    } catch (e) {
      setTxState({ type: 'err', msg: 'Failed to fetch records: ' + e.message });
    } finally {
      setFetchingRecords(false);
    }
  };

  if (!connected) {
    return (
      <div className="app-layout">
        <div className="card"><div className="empty"><div className="empty-icon">🔗</div><p>Connect your wallet to access the lending marketplace</p></div></div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">Lending Marketplace</h1>
        <p className="page-desc">Privacy-preserving marketplace — request, fund, and repay loans with ZK proofs</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-head">
          <div className="card-title">How It Works</div>
          <div className="badge badge-info">Hash-Based Matching</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
            <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>1. Request</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Borrower posts private request. Only hash is public.</div>
          </div>
          <div style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>2. Discover</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Lenders see hash + credit tier. No financial data exposed.</div>
          </div>
          <div style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
            <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>3. Fund</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Lender funds via hash reference. No record consumption needed.</div>
          </div>
          <div style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
            <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>4. Repay</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Borrower repays privately. Loan auto-closes at zero balance.</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['marketplace', 'request', 'fund', 'repay'].map(t => (
            <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
              {t === 'marketplace' ? '🏪 Browse' : t === 'request' ? '📝 Request' : t === 'fund' ? '💰 Fund Loan' : '💳 Repay'}
            </button>
          ))}
        </div>

        {/* MARKETPLACE / BROWSE TAB */}
        {tab === 'marketplace' && (
          <div style={{ maxWidth: 600, marginTop: 16 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
              To fund a loan, you need the borrower's <code style={{ color: 'var(--indigo-light)' }}>request_hash</code> and their address.
              The borrower shares these off-chain or via the marketplace. You can then verify their credit tier on-chain before funding.
            </p>

            <div className="field">
              <label className="field-label">Look Up Borrower Tier</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field-input" type="text" placeholder="aleo1..."
                       onChange={e => setApproveBorrower(e.target.value)} value={approveBorrower} style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={() => lookupTier(approveBorrower)}>Check</button>
              </div>
            </div>
            {borrowerTier !== null && (
              <div className="preview" style={{ marginTop: 12 }}>
                <div className="row">
                  <span className="row-label">Credit Tier</span>
                  <span className="mono" style={{ color: TIER_COLORS[borrowerTier] || 'var(--text-2)' }}>
                    {TIER_LABELS[borrowerTier] || `Tier ${borrowerTier}`}
                  </span>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="row-label">Eligible</span>
                  <span className="mono" style={{ color: borrowerTier > 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                    {borrowerTier > 0 ? '✅ Yes' : '❌ No'}
                  </span>
                </div>
              </div>
            )}

            <div className="preview" style={{ marginTop: 16 }}>
              <div className="row"><span className="row-label">Contract</span><span className="mono">{PROGRAM}</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Model</span><span className="mono">Hash-Based Marketplace</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Privacy</span><span className="mono">No financial data on-chain</span></div>
            </div>
          </div>
        )}

        {/* REQUEST TAB */}
        {tab === 'request' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
              Create a loan request. Your financial details stay <strong>completely private</strong> in an encrypted record.
              Only a <code style={{ color: 'var(--indigo-light)' }}>request_hash</code> is published to the marketplace for matching.
            </p>
            <div className="field">
              <label className="field-label">Loan Amount (microcredits)</label>
              <input className="field-input" type="number" placeholder="e.g. 10000000"
                     value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Duration (blocks)</label>
              <input className="field-input" type="number" placeholder="e.g. 10000"
                     value={duration} onChange={e => setDuration(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Collateral (microcredits)</label>
              <input className="field-input" type="number" placeholder="e.g. 5000000"
                     value={collateral} onChange={e => setCollateral(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleRequestLoan} disabled={loading || !amount} style={{ width: '100%' }}>
              {loading ? <><span className="spin"></span>Processing...</> : '📝 Submit Loan Request'}
            </button>
          </div>
        )}

        {/* FUND TAB (LENDER) */}
        {tab === 'fund' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
              Fund a loan by referencing the borrower's <code style={{ color: 'var(--indigo-light)' }}>request_hash</code>.
              The contract verifies the request exists, the borrower is eligible, and creates two private
              <code style={{ color: 'var(--indigo-light)' }}> LoanAgreement</code> records.
            </p>
            <div className="field">
              <label className="field-label">Request Hash</label>
              <input className="field-input" type="text" placeholder="1234567890field"
                     value={approveHash} onChange={e => setApproveHash(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Borrower Address</label>
              <input className="field-input" type="text" placeholder="aleo1..."
                     value={approveBorrower} onChange={e => setApproveBorrower(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Loan Amount (microcredits)</label>
              <input className="field-input" type="number" placeholder="e.g. 10000000"
                     value={approveAmount} onChange={e => setApproveAmount(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Interest Rate (basis points, max 5000)</label>
              <input className="field-input" type="number" placeholder="e.g. 500"
                     value={approveRate} onChange={e => setApproveRate(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Duration (blocks)</label>
              <input className="field-input" type="number" placeholder="e.g. 10000"
                     value={approveDuration} onChange={e => setApproveDuration(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleApproveLoan} disabled={loading || !approveHash || !approveBorrower || !approveAmount} style={{ width: '100%' }}>
              {loading ? <><span className="spin"></span>Processing...</> : '💰 Fund This Loan'}
            </button>
          </div>
        )}

        {/* REPAY TAB */}
        {tab === 'repay' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
              Repay your loan using your private <code style={{ color: 'var(--indigo-light)' }}>LoanAgreement</code> record.
              When the remaining balance hits zero, the loan auto-closes on-chain.
            </p>
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
              {loading ? <><span className="spin"></span>Processing...</> : '💳 Submit Repayment'}
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

      {/* PRIVATE RECORDS VIEWER */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">My Private Lending Records</div>
          <button className="btn btn-ghost" onClick={handleFetchRecords} disabled={fetchingRecords}>
            {fetchingRecords ? 'Decrypting...' : '↻ Refresh Records'}
          </button>
        </div>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 16 }}>
          View your encrypted LoanRequest hashes, LoanAgreements, and RepaymentReceipts.
          Copy the <code style={{ color: 'var(--indigo-light)' }}>request_hash</code> from your LoanRequest to share with potential lenders.
        </p>

        {myRequests.length === 0 ? (
           <div className="empty" style={{ padding: '20px 0' }}><p>No records fetched yet. Click refresh above.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {myRequests.map((r, i) => (
              <div key={i} style={{ padding: 12, background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: r.type === 'LoanRequest' ? 'var(--indigo-light)' : r.type === 'LoanAgreement' ? 'var(--emerald)' : 'var(--amber)' }}>
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
