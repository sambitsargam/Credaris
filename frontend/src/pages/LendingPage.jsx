import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { createClient } from '@supabase/supabase-js';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';


const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const PROGRAM = 'credaris_core_v5.aleo';
const CREDIT_PROGRAM = 'credaris_core_v5.aleo';




// Aleo testnet: ~5s per block
const DURATION_PRESETS = [
  { label: '1 Day',    value: '1d',  blocks: 17_280 },
  { label: '3 Days',   value: '3d',  blocks: 51_840 },
  { label: '1 Week',   value: '7d',  blocks: 120_960 },
  { label: '2 Weeks',  value: '14d', blocks: 241_920 },
  { label: '1 Month',  value: '30d', blocks: 518_400 },
  { label: '3 Months', value: '90d', blocks: 1_555_200 },
];

const TIER_LABELS = { 1: 'Tier A — Low Risk', 2: 'Tier B — Medium Risk', 3: 'Tier C — Higher Risk', 4: 'Tier D — Restricted Risk' };
const TIER_COLORS = { 1: 'var(--emerald)', 2: '#60a5fa', 3: 'var(--amber)', 4: '#ef4444' };
const LTV_RATIOS = { 1: 10, 2: 25, 3: 40, 4: 200 }; // Tier 4: 200% collateral = borrow up to 50% of collateral

export default function LendingPage() {
  const { wallet, address, connected, executeTransaction, transactionStatus, requestRecords, requestRecordPlaintexts } = useWallet();
  const [tab, setTab] = useState('marketplace');
  const [loading, setLoading] = useState(false);
  const [txState, setTxState] = useState(null);
  const pollRef = useRef(null);

  // Request state (borrower) - using ALEO units
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('7d');
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

  // Extract the real on-chain TX ID (at1...) from the wallet status response
  const getRealTxId = (shieldId, statusRes) => {
    // The real TX ID starts with "at1" — check all possible fields
    const candidates = [
      statusRes?.transactionId,
      statusRes?.transaction_id, 
      statusRes?.txId,
      statusRes?.tx_id,
      statusRes?.id,
    ];
    for (const c of candidates) {
      if (c && typeof c === 'string' && c.startsWith('at1')) return c;
    }
    // Check if it's nested in data/transaction
    const nested = statusRes?.data?.transactionId || statusRes?.transaction?.id;
    if (nested && typeof nested === 'string' && nested.startsWith('at1')) return nested;
    // Fallback: if the shield ID itself is an at1 ID
    if (shieldId && shieldId.startsWith('at1')) return shieldId;
    return shieldId; // fallback to shield ID
  };

  const waitForTx = (shieldId) => {
    return new Promise((resolve, reject) => {
      pollRef.current = setInterval(async () => {
        try {
          const res = await transactionStatus(shieldId);
          if (res && res.status && res.status.toLowerCase() !== 'pending') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            if (res.status.toLowerCase() === 'accepted') {
              const realId = getRealTxId(shieldId, res);
              console.log('TX confirmed! Shield:', shieldId, '→ Real:', realId, '| Full status:', JSON.stringify(res));
              resolve(realId);
            }
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
      const existingRaw = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
      const existing = existingRaw ? parseInt(existingRaw.replace(/u\d+$/g, ''), 10) : 0;
      const collateralMicro = Math.floor(parseFloat(collateral) * 1_000_000);
      
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'lock_collateral',
        inputs: [`${collateralMicro}u64`],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting lock collateral...` });
        const realTxId = await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `Collateral Locked! TX: ${realTxId}` });
      }
    } catch (err) {
      handleError(err);
    } finally {
      if(loading) setLoading(false);
    }
  };

  const handleUnlockCollateral = async () => {
    if (!connected) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Scanning for unused collateral...' });
    try {
      const existingRaw = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
      const existing = existingRaw ? parseInt(existingRaw.replace(/u\d+$/g, ''), 10) : 0;
      
      if (existing === 0) {
        setTxState({ type: 'err', msg: 'You have 0 ALEO locked. Nothing to withdraw.' });
        setLoading(false);
        return;
      }

      setTxState({ type: 'pending', msg: `Withdrawing ${(existing/1000000).toFixed(2)} ALEO...` });
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'unlock_collateral',
        inputs: [`${existing}u64`],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting unlock collateral...` });
        const realTxId = await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `✅ Collateral unlocked! TX: ${realTxId}` });
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
    if (!connected || !amount || !myTier) return;
    setLoading(true);

    try {
      const amountMicro = Math.floor(parseFloat(amount) * 1_000_000);
      const ratio = LTV_RATIOS[myTier] || 200;
      const requiredCollateralMicro = Math.ceil(amountMicro * ratio / 100);
      const nonce = `${Math.floor(Math.random() * 1_000_000_000)}field`;

      // Resolve duration preset to an absolute due_by block
      const preset = DURATION_PRESETS.find(p => p.value === duration);
      const durationBlocks = preset ? preset.blocks : 120_960; // default 1 week
      const blockHeightRes = await fetchBlockHeight();
      const currentBlock = typeof blockHeightRes === 'number' ? blockHeightRes : parseInt(blockHeightRes, 10);
      const dueByBlock = currentBlock + durationBlocks;

      // ── Intelligent Verification & Locking ────────────────
      const existingRaw = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
      const existingCol = existingRaw ? parseInt(existingRaw.replace(/u\d+$/g, ''), 10) : 0;
      const targetCol = requiredCollateralMicro;

      setTxState({ type: 'pending', msg: `Verifying collateral... Existing: ${(existingCol/1000000).toFixed(2)}, Required: ${(targetCol/1000000).toFixed(2)}` });

      if (existingCol < targetCol) {
        const diff = targetCol - existingCol;
        setTxState({ type: 'pending', msg: `Step 1/2 — Locking additional ${(diff / 1_000_000).toFixed(2)} ALEO collateral...` });
        const lockResult = await executeTransaction({
          program: PROGRAM,
          function: 'lock_collateral',
          inputs: [`${diff}u64`],
          fee: 500000,
          privateFee: false,
        });
        if (!lockResult?.transactionId) throw new Error('lock_collateral returned no transaction ID');
        setTxState({ type: 'pending', msg: `Step 1/2 — Locking collateral...` });
        const lockTxId = await waitForTx(lockResult.transactionId);
        setTxState({ type: 'pending', msg: `Step 1/2 ✅ — Confirmed: ${lockTxId}` });
      } else if (existingCol > targetCol) {
        // v5 requires EXACT match when requesting (to prevent accidental freeze of huge amounts). 
        // Force them to unlock the extra first.
        throw new Error(`You have ${(existingCol/1000000).toFixed(2)} ALEO locked, but the loan strictly requires ${(targetCol/1000000).toFixed(2)}. Please unlock the difference first!`);
      } else {
        setTxState({ type: 'pending', msg: '✅ Exact collateral already locked. Skipping lock phase...' });
      }

      // ── Compute request_hash using BHP256 WASM (Plaintext-based) ──────────
      setTxState({ type: 'pending', msg: 'Computing deterministic request hash...' });
      const { computeRequestHash } = await import('../utils/aleoHash.js');
      let actualRequestHash;
      try {
        actualRequestHash = await computeRequestHash(
          amountMicro, dueByBlock, requiredCollateralMicro, nonce, address
        );
        console.log('✅ Computed request_hash:', actualRequestHash);
      } catch (hashErr) {
        console.error('BHP256 computation failed:', hashErr);
        throw new Error(`Hash computation failed: ${hashErr.message}`);
      }

      console.log('=== request_loan inputs ===');
      console.log('amount:', `${amountMicro}u64`, '| duration:', `${dueByBlock}u32`);
      console.log('collateral:', `${requiredCollateralMicro}u64`, '| nonce:', nonce);
      console.log('borrower:', address, '| hash:', actualRequestHash);

      setTxState({ type: 'pending', msg: 'Step 2/2 — Submitting loan request...' });
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'request_loan',
        inputs: [
          `${amountMicro}u64`,
          `${dueByBlock}u32`,
          `${requiredCollateralMicro}u64`,
          nonce,
        ],
        fee: 500000,
        privateFee: false,
      });
      if (!result?.transactionId) throw new Error('request_loan returned no transaction ID');

      setTxState({ type: 'pending', msg: `Step 2/2 — Broadcasting loan request...` });
      const realTxId = await waitForTx(result.transactionId);

      // Store all values as strings to prevent Supabase type coercion
      await supabase.from('loan_requests').insert({
        request_hash: String(actualRequestHash),
        borrower: String(address),
        amount: amountMicro,
        duration: dueByBlock,
        collateral: requiredCollateralMicro,
        nonce: String(nonce),
        risk_level: myTier,
      });

      setTxState({ type: 'ok', msg: `✅ Loan live on marketplace! TX: ${realTxId}` });
      setAmount('');


    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // LENDER: Approve/Fund a Loan
  // ═══════════════════════════════════════════
  const handleApproveLoan = async (reqPayload) => {
    if (!connected || !approveRate) return;

    // Prevent self-funding
    if (reqPayload.borrower === address) {
      setTxState({ type: 'err', msg: '⛔ You cannot fund your own loan. Connect a different wallet to act as lender.' });
      return;
    }

    setLoading(true);
    setTxState({ type: 'pending', msg: 'Recomputing hash & funding loan...' });
    try {
      // Recompute the hash from stored params to ensure consistency
      const { computeRequestHash } = await import('../utils/aleoHash.js');
      const nonceStr = String(reqPayload.nonce).endsWith('field') ? reqPayload.nonce : `${reqPayload.nonce}field`;
      
      let recomputedHash;
      try {
        recomputedHash = await computeRequestHash(
          reqPayload.amount, reqPayload.duration, reqPayload.collateral,
          nonceStr, reqPayload.borrower
        );
      } catch (e) {
        console.warn('Hash recomputation failed, using stored hash:', e);
        recomputedHash = String(reqPayload.request_hash).endsWith('field') 
          ? reqPayload.request_hash 
          : `${reqPayload.request_hash}field`;
      }

      const hashStr = recomputedHash;
      const amountStr = `${reqPayload.amount}u64`;
      const rateStr = `${parseInt(approveRate)}u64`;
      const durationStr = `${reqPayload.duration}u32`;
      const collateralStr = `${reqPayload.collateral}u64`;

      console.log('=== approve_loan inputs ===');
      console.log('stored_hash:', reqPayload.request_hash);
      console.log('recomputed_hash:', recomputedHash);
      console.log('using_hash:', hashStr);
      console.log('borrower:', reqPayload.borrower);
      console.log('amount:', amountStr, '| duration:', durationStr);
      console.log('collateral:', collateralStr, '| nonce:', nonceStr);

      const result = await executeTransaction({
        program: PROGRAM,
        function: 'approve_loan',
        inputs: [
          hashStr,
          reqPayload.borrower,
          amountStr,
          rateStr,
          durationStr,
          collateralStr,
          nonceStr,
        ],
        fee: 500000,
        privateFee: false,
      });

      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting approval...` });
        const realTxId = await waitForTx(result.transactionId);
        await supabase.from('loan_requests').delete().eq('request_hash', reqPayload.request_hash);
        fetchMarketplace();
        setTxState({ type: 'ok', msg: `Loan successfully funded! TX: ${realTxId}` });
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
        const realTxId = await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `Repayment secured! TX: ${realTxId}` });
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
        <p className="page-desc" style={{ color: 'var(--emerald)' }}>🔐 credaris_core_v5.aleo — Flexible Mapping Collateral · Loan-Level Isolation · Zero Record Inputs</p>
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
            <div className="badge badge-info" style={{ marginBottom: 16 }}>ⓘ Lenders cannot see borrower income or exact collateral sizes natively. Only ZK risk tier is shared.</div>

            {/* Global rate input for lenders */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 16px', background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)', maxWidth: 650 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, fontWeight: 500 }}>YOUR PROPOSED INTEREST RATE (basis points)</div>
                <input
                  className="field-input"
                  type="number"
                  placeholder="e.g. 500 = 5.00% APR"
                  value={approveRate}
                  onChange={e => setApproveRate(e.target.value)}
                  style={{ marginBottom: 0, width: '100%' }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 80, textAlign: 'right', lineHeight: 1.5 }}>
                {approveRate ? <><strong style={{ color: 'var(--indigo-light)', fontSize: 16 }}>{(parseInt(approveRate) / 100).toFixed(2)}%</strong><br/>APR</> : '—'}
              </div>
            </div>

            {marketRequests.length === 0 ? (
               <div className="empty"><p>No active loan requests on the marketplace yet.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 650 }}>
                {marketRequests.map(req => (
                  <div key={req.request_hash} style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                       <div>
                         <div style={{ fontWeight: 600, color: TIER_COLORS[req.risk_level] || 'var(--text-1)', fontSize: 15 }} title="Credit tiers are generated using zero-knowledge proofs. Raw financial data is never exposed.">
                           {TIER_LABELS[req.risk_level] || 'Unknown Risk'}
                         </div>
                         <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
                           Duration: <strong>{req.duration.toLocaleString()} blocks</strong>
                         </div>
                         <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                           ID: <span className="mono">{req.request_hash.slice(0, 20)}...</span>
                         </div>
                       </div>
                       <button
                         className="btn btn-primary"
                         onClick={() => handleApproveLoan(req)}
                         disabled={loading || !approveRate}
                         style={{ minWidth: 110, alignSelf: 'center' }}
                         title={!approveRate ? 'Set your proposed rate above first' : `Fund at ${(parseInt(approveRate)/100).toFixed(2)}% APR`}
                       >
                         {loading ? <><span className="spin"></span>Funding...</> : '⚡ Fund Loan'}
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="preview" style={{ marginTop: 24, maxWidth: 650 }}>
              <div className="row"><span className="row-label">Contract Protocol</span><span className="mono">{PROGRAM}</span></div>
              <div className="row" style={{ marginTop: 8 }}><span className="row-label">Privacy State</span><span className="mono" style={{ color: "var(--indigo-light)"}}>Borrower financial data is ZK-hidden. Only risk tier is visible to lenders.</span></div>
            </div>
          </div>
        )}


        {tab === 'request' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>

            {!myTier && (
              <div className="badge badge-err" style={{ marginBottom: 16, display: 'block', padding: 12 }}>
                No credit score found. Complete <strong>Income Verification</strong> then <strong>Compute Score</strong> before requesting a loan.
              </div>
            )}

            {myTier && (
              <div className="badge badge-info" style={{ marginBottom: 16, display: 'block', padding: 12,
                background: myTier === 4 ? 'rgba(239,68,68,0.08)' : undefined,
                color: myTier === 4 ? '#ef4444' : undefined,
                border: myTier === 4 ? '1px solid rgba(239,68,68,0.4)' : undefined,
              }}>
                <strong>{TIER_LABELS[myTier]}</strong> &mdash;&nbsp;
                {myTier === 4
                  ? <>You may borrow up to <strong>50%</strong> of collateral &mdash; requires <strong>200%</strong> collateral of loan amount.</>
                  : <>Requires minimum <strong>{LTV_RATIOS[myTier]}%</strong> collateral of loan amount.</>
                }
                {amount && (
                  <><br/>Auto-collateral for this loan: <strong>{(parseFloat(amount) * (LTV_RATIOS[myTier] / 100)).toFixed(4)} ALEO</strong></>
                )}
              </div>
            )}

            <div className="field">
              <label className="field-label">Loan Amount (ALEO)</label>
              <input className="field-input" type="number" step="0.000001" placeholder="e.g. 10.0"
                     value={amount} onChange={e => setAmount(e.target.value)} />
            </div>

            <div className="field">
              <label className="field-label">Loan Duration</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                {DURATION_PRESETS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setDuration(p.value)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: duration === p.value ? '1.5px solid var(--indigo-light)' : '1.5px solid var(--border)',
                      background: duration === p.value ? 'var(--indigo-dim, rgba(99,102,241,0.15))' : 'transparent',
                      color: duration === p.value ? 'var(--indigo-light)' : 'var(--text-2)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: duration === p.value ? 600 : 400,
                      transition: 'all 0.15s',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
              {duration && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                  ≈ {DURATION_PRESETS.find(p => p.value === duration)?.blocks.toLocaleString()} blocks
                </div>
              )}
            </div>

            {amount && myTier && (
              <div className="preview" style={{ marginBottom: 16 }}>
                <div className="row"><span className="row-label">You borrow</span><span className="mono">{parseFloat(amount).toFixed(4)} ALEO</span></div>
                <div className="row" style={{ marginTop: 8 }}><span className="row-label">Auto-locked collateral</span><span className="mono">{(parseFloat(amount) * LTV_RATIOS[myTier] / 100).toFixed(4)} ALEO</span></div>
                <div className="row" style={{ marginTop: 8 }}><span className="row-label">Steps</span><span className="mono">TX 1: Lock collateral → TX 2: Request loan</span></div>
              </div>
            )}

            <button className="btn btn-primary" onClick={handleRequestLoan}
              disabled={loading || !amount || !myTier || !duration}
              style={{ width: '100%' }}>
              {loading
                ? <><span className="spin"></span>{txState?.msg || 'Processing...'}</>
                : '🚀 Lock Collateral & Request Loan'}
            </button>
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>Have unused locked collateral?</div>
              <button className="btn btn-ghost" onClick={handleUnlockCollateral} disabled={loading} style={{ width: '100%', borderColor: 'var(--border)' }}>
                {loading ? <><span className="spin"></span>Syncing...</> : '🔓 Withdraw Unused Collateral'}
              </button>
            </div>
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
