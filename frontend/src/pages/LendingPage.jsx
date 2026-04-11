import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { createClient } from '@supabase/supabase-js';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const PROGRAM = 'credaris_core_v2.aleo';
const CREDIT_PROGRAM = 'credaris_core_v2.aleo';

const TIER_LABELS = { 1: 'Tier A — Low Risk', 2: 'Tier B — Medium Risk', 3: 'Tier C — Higher Risk', 4: 'Tier D — Restricted Risk' };
const TIER_COLORS = { 1: 'var(--emerald)', 2: '#60a5fa', 3: 'var(--amber)', 4: '#ef4444' };
const LTV_RATIOS = { 1: 10, 2: 25, 3: 40, 4: 100 };

export default function LendingPage() {
  const { wallet, address, connected, executeTransaction, transactionStatus, requestRecords } = useWallet();
  const [tab, setTab] = useState('marketplace');
  const [loading, setLoading] = useState(false);
  const [txState, setTxState] = useState(null);
  const pollRef = useRef(null);

  // Request state (borrower) - using ALEO units
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('10000');
  const [collateral, setCollateral] = useState('');
  const [myTier, setMyTier] = useState(null);
  
  // v10 UX: Locked Collateral Record
  const [collateralRecordText, setCollateralRecordText] = useState('');

  // Approve state (lender)
  const [approveRate, setApproveRate] = useState('500');

  // Repay state
  const [agreementRecordText, setAgreementRecordText] = useState('');
  const [repayAmount, setRepayAmount] = useState('');

  // Marketplace & Private data
  const [marketRequests, setMarketRequests] = useState([]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const fetchMarketplace = async () => {
    try {
      const { data, error } = await supabase.from('loan_requests').select('*').order('created_at', { ascending: false });
      if (!error && data) setMarketRequests(data);
    } catch (e) {
      console.error('Supabase fetch err', e);
    }
  };

  useEffect(() => {
    if (tab === 'marketplace') fetchMarketplace();
  }, [tab]);

  useEffect(() => {
    const initTier = async () => {
      if (!address) return;
      const t = await fetchMappingValue(CREDIT_PROGRAM, 'credit_tier', address);
      if (t) {
        const val = parseInt(String(t).replace(/['"]/g, '').replace(/u\d+$/g, ''), 10);
        if (!isNaN(val) && val > 0) setMyTier(val);
      }
    };
    initTier();
  }, [address]);

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

  const handleError = (err) => {
    const msg = err.message || '';
    if (msg.includes('assert_eq') || msg.includes('computed_hash')) {
      setTxState({ type: 'err', msg: 'Request data mismatch. Please refresh and try again.' });
    } else if (msg.includes('min_col') || msg.includes('collateral')) {
      setTxState({ type: 'err', msg: 'Collateral parameter failed validation thresholds.' });
    } else if (msg.includes('tier') || msg.includes('risk')) {
      setTxState({ type: 'err', msg: 'Credit verification required before borrowing.' });
    } else {
      setTxState({ type: 'err', msg: msg });
    }
    setLoading(false);
  };

  // ═══════════════════════════════════════════
  // BORROWER: 0. Lock Collateral
  // ═══════════════════════════════════════════
  const handleLockCollateral = async () => {
    if (!connected || !collateral) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Minting cryptographically locked Collateral record...' });
    try {
      const collateralMicro = Math.floor(parseFloat(collateral) * 1_000_000);
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'lock_collateral',
        inputs: [`${collateralMicro}u64`],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting layout: ${result.transactionId}` });
        await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `Collateral Locked! Wait 1 block and fetch your records to proceed.` });
      }
    } catch (err) {
      handleError(err);
    } finally {
      if(loading) setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // BORROWER: 0b. Auto-Fetch Collateral Record
  // ═══════════════════════════════════════════
  const handleFetchCollateral = async () => {
    if (!connected) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Scanning wallet for locked collateral...' });
    try {
      console.log('Initiating record request for:', PROGRAM);
      let recs = [];
      try {
        recs = await requestRecords(PROGRAM);
      } catch (err) {
        console.warn('requestRecords(PROGRAM) failed, fallback to global requestRecords()...', err);
        recs = await requestRecords();
      }
      
      console.log('Wallet Array Output:', recs);

      if (recs && recs.length > 0) {
        const lockedCol = recs.find(r => {
          // Native Leo Wallet adaptor object targeting explicit 'Collateral' definitions that are NOT spent
          if (r.recordName === 'Collateral' && r.spent === false) return true;
          
          // Fallback string manipulation matching for generic JSON adaptors
          const str = (typeof r === 'string' ? r : (r.plaintext || r.recordPlaintext || JSON.stringify(r))).toLowerCase();
          return str.includes('collateral') && str.includes('true.private');
        });
        
        if (lockedCol) {
          // Fallback hierarchy safely extracting exactly the payload needed for execute loops
          const text = typeof lockedCol === 'string' ? lockedCol : (lockedCol.recordPlaintext || lockedCol.plaintext || lockedCol.recordCiphertext || JSON.stringify(lockedCol, null, 2));
          console.log('Target Selected Record Text Native Loading:', text);
          setCollateralRecordText(text);
          setTxState({ type: 'ok', msg: 'Locked Collateral record auto-filled successfully!' });
        } else {
          setTxState({ type: 'err', msg: 'No active unspent Collateral records found. Did you complete Phase 1?' });
        }
      } else {
        setTxState({ type: 'err', msg: 'Wallet returned 0 records. Ensure your wallet block-height is fully synced.' });
      }
    } catch (e) {
      console.error('Fetch Err:', e);
      handleError(e);
    } finally {
      if (loading) setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // BORROWER: 1. Request a Loan
  // ═══════════════════════════════════════════
  const handleRequestLoan = async () => {
    if (!connected || !amount || !collateralRecordText || !myTier) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Burning Collateral & submitting request...' });
    try {
      const nonce = `${Math.floor(Math.random() * 1000000000)}field`;
      const amountMicro = Math.floor(parseFloat(amount) * 1_000_000);
      const collateralMicro = Math.floor(parseFloat(collateral) * 1_000_000);

      const result = await executeTransaction({
        program: PROGRAM,
        function: 'request_loan',
        inputs: [`${amountMicro}u64`, `${parseInt(duration)}u32`, collateralRecordText, nonce],
        fee: 500000,
        privateFee: false,
      });

      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting execution: ${result.transactionId}` });
        await waitForTx(result.transactionId);

        const reqHash = `req_${Math.floor(Math.random()*100000)}field`; 

        await supabase.from('loan_requests').insert({
          request_hash: reqHash,
          borrower: address,
          amount: amountMicro,
          duration: parseInt(duration),
          collateral: collateralMicro, 
          nonce,
          risk_level: myTier
        });

        setTxState({ type: 'ok', msg: `Request successfully listed to marketplace! TX: ${result.transactionId}` });
        setCollateralRecordText('');
      }
    } catch (err) {
      handleError(err);
    } finally {
      if(loading) setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // LENDER: Approve/Fund a Loan
  // ═══════════════════════════════════════════
  const handleApproveLoan = async (reqPayload) => {
    if (!connected || !approveRate) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Funding secure loan request...' });
    try {
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'approve_loan',
        inputs: [
          reqPayload.request_hash,
          reqPayload.borrower,
          `${reqPayload.amount}u64`,
          `${parseInt(approveRate)}u64`,
          `${reqPayload.duration}u32`,
          `${reqPayload.collateral}u64`,
          reqPayload.nonce,
        ],
        fee: 500000,
        privateFee: false,
      });

      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting approval phase...` });
        await waitForTx(result.transactionId);
        await supabase.from('loan_requests').delete().eq('request_hash', reqPayload.request_hash);
        fetchMarketplace();
        setTxState({ type: 'ok', msg: `Loan successfully funded! TX: ${result.transactionId}` });
      }
    } catch (err) {
      handleError(err);
    } finally {
      if(loading) setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // BORROWER: Repay a Loan
  // ═══════════════════════════════════════════
  const handleRepayLoan = async () => {
    if (!connected || !agreementRecordText || !repayAmount) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Submitting payment payload...' });
    try {
      const repayMicro = Math.floor(parseFloat(repayAmount) * 1_000_000);
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'repay_loan',
        inputs: [agreementRecordText, `${repayMicro}u64`],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `Repayment secured! Check balance to view unlocked collateral. TX: ${result.transactionId}` });
      }
    } catch (err) {
      handleError(err);
    } finally {
      if(loading) setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="app-layout">
        <div className="card"><div className="empty"><div className="empty-icon">🔗</div><p>Connect wallet to access the secure marketplace</p></div></div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">Credaris Marketplace</h1>
        <p className="page-desc" style={{ color: 'var(--emerald)' }}>🔐 Architecture v10 — Cryptographic Collateral Records Enforced.</p>
      </div>

      <div className="card">
        <div className="card-head" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['marketplace', 'request', 'repay'].map(t => (
            <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
              {t === 'marketplace' ? '🏪 Browse' : t === 'request' ? '📝 Request Loan' : '💳 Make Repayment'}
            </button>
          ))}
        </div>

        {tab === 'marketplace' && (
          <div style={{ marginTop: 16 }}>
            <div className="badge badge-info" style={{ marginBottom: 16 }}>ⓘ Lenders cannot see borrower income or exact collateral sizes natively. Only risk level is shared.</div>
            
            {marketRequests.length === 0 ? (
               <div className="empty"><p>No active loan requests matching your pool...</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 650 }}>
                {marketRequests.map(req => (
                  <div key={req.request_hash} style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <div>
                          <div style={{ fontWeight: 600, color: TIER_COLORS[req.risk_level] || 'var(--text-1)' }} title="Credit tiers are generated using zero-knowledge proofs. Raw financial data is never exposed.">
                            {TIER_LABELS[req.risk_level] || 'Unknown Risk'}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
                            {req.duration} blocks limit • Hash: <span className="mono">{req.request_hash.slice(0, 15)}...</span>
                          </div>
                       </div>
                       <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                         <input className="field-input" type="number" placeholder="Proposed Rate % (e.g. 500)" value={approveRate} onChange={e => setApproveRate(e.target.value)} style={{ width: 140, marginBottom: 0 }} />
                         <button className="btn btn-primary" onClick={() => handleApproveLoan(req)} disabled={loading}>
                           Fund Loan
                         </button>
                       </div>
                    </div>
                  </div>
                ))}
            </div>
            )}
            <div className="preview" style={{ marginTop: 24, maxWidth: 650 }}>
              <div className="row"><span className="row-label">Contract Protocol</span><span className="mono">{PROGRAM}</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Privacy State</span><span className="mono" style={{ color: "var(--indigo-light)"}}>This request is privacy-protected. Financial details are hidden.</span></div>
            </div>
          </div>
        )}

        {tab === 'request' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
              <strong>Phase 1:</strong> You must cryptographically lock collateral before your request. 
            </p>
            <div className="field">
              <label className="field-label">Target Collateral (ALEO)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field-input" type="number" step="0.1" placeholder="e.g. 5.5"
                       value={collateral} onChange={e => setCollateral(e.target.value)} style={{ flex: 1, marginBottom: 0 }} />
                <button className="btn btn-secondary" onClick={handleLockCollateral} disabled={loading || !collateral}>
                  🔒 Lock Collateral
                </button>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border)', margin: '24px 0' }}></div>

            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
              <strong>Phase 2:</strong> Absorb locked collateral and submit global request.
            </p>
            <div className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="field-label" style={{ marginBottom: 0 }}>Paste or Fetch Locked `Collateral` Record</label>
                <button className="btn btn-ghost" onClick={handleFetchCollateral} disabled={loading} style={{ padding: '4px 8px', fontSize: 12 }}>
                  🔄 Auto-Fetch from Wallet
                </button>
              </div>
              <textarea className="field-input" rows="3" placeholder="{ owner: aleo1..., amount: 5000000u64.private, is_locked: true.private, ... }"
                        value={collateralRecordText} onChange={e => setCollateralRecordText(e.target.value)} style={{ resize: 'vertical' }} />
            </div>

            <div className="field">
              <label className="field-label">Loan Amount (ALEO)</label>
              <input className="field-input" type="number" step="0.1" placeholder="e.g. 10.0"
                     value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Duration (blocks)</label>
              <input className="field-input" type="number" placeholder="e.g. 10000"
                     value={duration} onChange={e => setDuration(e.target.value)} />
            </div>

            {myTier > 0 && myTier <= 3 && (
              <div className="badge badge-info" style={{ marginBottom: 16, display: 'block', padding: 12 }}>
                Your ZK tier (<strong>{TIER_LABELS[myTier]}</strong>) allows up to <strong>{100 - LTV_RATIOS[myTier]}%</strong> borrowing power.<br/>
                Minimum collateral required: <strong>{amount ? (parseFloat(amount) * (LTV_RATIOS[myTier]/100)).toFixed(2) : 0}</strong> ALEO.
              </div>
            )}
            
            {myTier === 4 && (
              <div className="badge badge-err" style={{ marginBottom: 16, display: 'block', padding: 12, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid #ef4444' }}>
                Your ZK tier (<strong>Tier D — Restricted Risk</strong>) blocks you from creating new loan requests on the contract level.
              </div>
            )}
            
            <button className="btn btn-primary" onClick={handleRequestLoan} disabled={loading || !amount || !collateralRecordText || !myTier || myTier === 4} style={{ width: '100%' }}>
              {loading ? <><span className="spin"></span>Broadcasting...</> : '📝 Submit ZK Request'}
            </button>
          </div>
        )}

        {tab === 'repay' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
              Repay your loan privately. Once totally complete, the `LoanAgreement` unspools your originally nested `Collateral` parameter back globally!
            </p>
            <div className="field">
              <label className="field-label">LoanAgreement Record (Decrypted)</label>
              <textarea className="field-input" rows="4" placeholder="{ owner: aleo1..., principal: 10000000u64.private, ... }"
                        value={agreementRecordText} onChange={e => setAgreementRecordText(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div className="field">
              <label className="field-label">Repayment Amount (ALEO)</label>
              <input className="field-input" type="number" step="0.1" placeholder="e.g. 5.5"
                     value={repayAmount} onChange={e => setRepayAmount(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleRepayLoan} disabled={loading || !agreementRecordText || !repayAmount} style={{ width: '100%', marginTop: 8 }}>
              {loading ? <><span className="spin"></span>Syncing with chain...</> : '💳 Submit Repayment Chunk'}
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
    </div>
  );
}
