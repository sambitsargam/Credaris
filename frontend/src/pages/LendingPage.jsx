import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';
import { supabase } from '../supabaseClient';

const PROGRAM = 'core_credaris.aleo';

const TIER_LABELS = { 1: 'Excellent', 2: 'Good', 3: 'Fair', 4: 'Poor' };
const LTV_RATIOS = { 1: 10, 2: 25, 3: 40, 4: 200 };
const DURATION_PRESETS = [
  { label: '1 Day', value: '1d', blocks: 28800 },
  { label: '3 Days', value: '3d', blocks: 86400 },
  { label: '1 Week', value: '1w', blocks: 201600 },
  { label: '1 Month', value: '1m', blocks: 806400 },
];

export default function LendingPage() {
  const { address, connected, executeTransaction, transactionStatus, requestRecords } = useWallet();

  // Poll until transaction is confirmed on-chain
  const waitForTx = useCallback(async (txId) => {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const res = await transactionStatus(txId);
        const status = typeof res === 'string' ? res : res?.status;
        if (status === 'Finalized' || status === 'Completed' || status === 'Accepted') {
          return [res?.transactionId, res?.transaction_id, res?.id].find(c => c && typeof c === 'string' && c.startsWith('at1')) || txId;
        }
        // Immediate exit on terminal failures
        if (status === 'Rejected' || status === 'Failed') {
          throw new Error(`Transaction ${status}`);
        }
      } catch (e) {
        if (e.message?.includes('Rejected') || e.message?.includes('Failed')) throw e;
      }
    }
    return txId;
  }, [transactionStatus]);

  const [loading, setLoading] = useState(false);
  const [txState, setTxState] = useState(null);
  
  const [tab, setTab] = useState('marketplace'); // 'marketplace' | 'request' | 'repay'
  const [marketRequests, setMarketRequests] = useState([]);
  
  // Request Loan inputs
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('1w');
  const [myTier, setMyTier] = useState(null);
  const [collateral, setCollateral] = useState(''); // manual lock amount
  
  // Repayment inputs
  const [repayAmount, setRepayAmount] = useState('');
  const [agreementRecordText, setAgreementRecordText] = useState('');
  
  // Approve inputs
  const [approveRate, setApproveRate] = useState('500'); // basis points: 5%

  useEffect(() => {
    if (connected) {
      fetchUserStatus();
      fetchMarketplace();
    }
  }, [connected, address]);

  const fetchUserStatus = async () => {
    try {
      const tierVal = await fetchMappingValue(PROGRAM, 'credit_tier', address);
      if (tierVal) setMyTier(parseInt(tierVal));
    } catch (e) {
      console.warn('Status fetch err:', e);
    }
  };

  const fetchMarketplace = async () => {
    const { data, error } = await supabase
      .from('loan_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setMarketRequests(data);
  };

  const handleError = (err) => {
    console.error(err);
    const msg = err.message || JSON.stringify(err);
    setTxState({ type: 'err', msg: msg.includes('User rejected') ? 'Transaction cancelled by user.' : msg });
  };

  // ═══════════════════════════════════════════
  // BORROWER: 0. Lock Collateral (Atomic pull)
  // ═══════════════════════════════════════════
  const handleLockCollateral = async () => {
    if (!connected || !collateral) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Locking collateral — ALEO will be atomically pulled into contract escrow...' });
    try {
      const collateralMicro = Math.floor(parseFloat(collateral) * 1_000_000);
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'lock_collateral',
        inputs: [`${collateralMicro}u64`],
        fee: 600_000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: 'Broadcasting atomic collateral lock...' });
        const realTxId = await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `✅ ${parseFloat(collateral).toFixed(4)} ALEO securely locked! TX: ${realTxId}` });
        setCollateral('');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockCollateral = async () => {
    if (!connected) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Checking locked collateral balance...' });
    try {
      const existingRaw = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
      const existing = existingRaw ? parseInt(existingRaw.replace(/u\d+$/g, ''), 10) : 0;
      
      if (existing === 0) {
        setTxState({ type: 'err', msg: 'You have 0 ALEO locked in contract. Nothing to withdraw.' });
        setLoading(false);
        return;
      }

      setTxState({ type: 'pending', msg: `Withdrawing ${(existing/1_000_000).toFixed(4)} ALEO from contract escrow...` });
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'unlock_collateral',
        inputs: [`${existing}u64`],
        fee: 600_000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: 'Broadcasting collateral unlock...' });
        const realTxId = await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `✅ ${(existing/1_000_000).toFixed(4)} ALEO returned to your wallet! TX: ${realTxId}` });
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
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

      const preset = DURATION_PRESETS.find(p => p.value === duration);
      const durationBlocks = preset ? preset.blocks : 201600;
      const blockHeightRes = await fetchBlockHeight();
      const currentBlock = typeof blockHeightRes === 'number' ? blockHeightRes : parseInt(blockHeightRes, 10);
      const dueByBlock = currentBlock + durationBlocks;

      // Verification
      const existingRaw = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
      const existingCol = existingRaw ? parseInt(existingRaw.replace(/u\d+$/g, ''), 10) : 0;
      const targetCol = requiredCollateralMicro;

      setTxState({ type: 'pending', msg: `Verifying collateral... Existing: ${(existingCol/1000000).toFixed(2)}, Required: ${(targetCol/1000000).toFixed(2)}` });

      if (existingCol < targetCol) {
        const diff = targetCol - existingCol;
        setTxState({ type: 'pending', msg: `Step 1/2 — Locking additional ${(diff / 1_000_000).toFixed(2)} ALEO...` });
        const lockResult = await executeTransaction({
          program: PROGRAM,
          function: 'lock_collateral',
          inputs: [`${diff}u64`],
          fee: 600_000,
          privateFee: false,
        });
        if (!lockResult?.transactionId) throw new Error('lock_collateral failed');
        await waitForTx(lockResult.transactionId);
        setTxState({ type: 'pending', msg: `Step 1/2 ✅ Collateral Secured` });
      }

      setTxState({ type: 'pending', msg: 'Computing request hash...' });
      const { computeRequestHash } = await import('../utils/aleoHash.js');
      const actualRequestHash = await computeRequestHash(amountMicro, dueByBlock, requiredCollateralMicro, nonce, address);

      setTxState({ type: 'pending', msg: 'Step 2/2 — Submitting loan request...' });
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'request_loan',
        inputs: [`${amountMicro}u64`, `${dueByBlock}u32`, `${requiredCollateralMicro}u64`, nonce],
        fee: 600_000,
        privateFee: false,
      });
      if (!result?.transactionId) throw new Error('request_loan failed');

      setTxState({ type: 'pending', msg: `Broadcasting loan request...` });
      const realTxId = await waitForTx(result.transactionId);

      await supabase.from('loan_requests').insert({
        request_hash: String(actualRequestHash),
        borrower: String(address),
        amount: amountMicro,
        duration: dueByBlock,
        collateral: requiredCollateralMicro,
        nonce: String(nonce),
        risk_level: String(myTier),
      });

      setTxState({ type: 'ok', msg: `✅ Loan live on marketplace! TX: ${realTxId}` });
      setAmount('');
      fetchMarketplace();

    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // LENDER: Approve/Fund a Loan (Atomic pull principal)
  // ═══════════════════════════════════════════
  const handleApproveLoan = async (reqPayload) => {
    if (!connected || !approveRate) return;
    if (reqPayload.borrower === address) {
      setTxState({ type: 'err', msg: '⛔ Cannot fund your own loan.' });
      return;
    }

    setLoading(true);
    try {
      const principalAleo = (reqPayload.amount / 1_000_000).toFixed(4);
      const { computeRequestHash } = await import('../utils/aleoHash.js');
      const nonceStr = String(reqPayload.nonce).endsWith('field') ? reqPayload.nonce : `${reqPayload.nonce}field`;
      const recomputedHash = await computeRequestHash(reqPayload.amount, reqPayload.duration, reqPayload.collateral, nonceStr, reqPayload.borrower);

      setTxState({ type: 'pending', msg: `Funding ${principalAleo} ALEO — signing atomic loan approval...` });
      const approveResult = await executeTransaction({
        program: PROGRAM,
        function: 'approve_loan',
        inputs: [
          recomputedHash,
          reqPayload.borrower,
          `${reqPayload.amount}u64`,
          `${parseInt(approveRate)}u64`,
          `${reqPayload.duration}u32`,
          `${reqPayload.collateral}u64`,
          nonceStr,
        ],
        fee: 800_000,
        privateFee: false,
      });

      if (approveResult?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting atomic loan funding...` });
        const realTxId = await waitForTx(approveResult.transactionId);
        await supabase.from('loan_requests').delete().eq('request_hash', reqPayload.request_hash);
        fetchMarketplace();
        setTxState({ type: 'ok', msg: `✅ Loan funded! ${principalAleo} ALEO atomically sent to borrower. TX: ${realTxId}` });
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // BORROWER: Repay a Loan (Atomic pull repay)
  // ═══════════════════════════════════════════
  const handleRepayLoan = async () => {
    if (!connected || !agreementRecordText || !repayAmount) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Submitting atomic repayment — ALEO will be pulled from your wallet to lender...' });
    try {
      const repayMicro = Math.floor(parseFloat(repayAmount) * 1_000_000);
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'repay_loan',
        inputs: [agreementRecordText, `${repayMicro}u64`],
        fee: 800_000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: 'Broadcasting atomic repayment...' });
        const realTxId = await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `✅ ${repayAmount} ALEO atomically repaid! TX: ${realTxId}` });
        setRepayAmount('');
        setAgreementRecordText('');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
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
        <p className="page-desc" style={{ color: 'var(--emerald)' }}>🔐 {PROGRAM} — Real ALEO Escrow · Atomic Single-TX Logic · ZK Financial Identity</p>
      </div>

      <div className="card">
        <div className="card-head" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['marketplace', 'request', 'repay'].map(t => (
            <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
              {t === 'marketplace' ? '🏪 Browse' : t === 'request' ? '📝 Request Loan' : '💳 Repay Loan'}
            </button>
          ))}
        </div>

        {tab === 'marketplace' && (
          <div style={{ marginTop: 16 }}>
            <div className="badge badge-info" style={{ marginBottom: 16 }}>⚡ Funding a loan pulls <strong>real ALEO</strong> from your wallet directly to the borrower in one atomic transaction.</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 16px', background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)', maxWidth: 650 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, fontWeight: 500 }}>PROPOSED ANNUAL RATE (basis points)</div>
                <input className="field-input" type="number" placeholder="e.g. 500 = 5.00% APR" value={approveRate} onChange={e => setApproveRate(e.target.value)} style={{ marginBottom: 0, width: '100%' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 80, textAlign: 'right' }}>
                {approveRate ? <><strong style={{ color: 'var(--indigo-light)', fontSize: 16 }}>{(parseInt(approveRate) / 100).toFixed(2)}%</strong><br/>APR</> : '—'}
              </div>
            </div>

            {marketRequests.length === 0 ? (
               <div className="empty"><p>No active loan requests.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 650 }}>
                {marketRequests.map(req => (
                  <div key={req.request_hash} className="request-card" style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>BORROWER: <span className="mono" style={{ color: 'var(--text-1)' }}>{req.borrower.slice(0,10)}...{req.borrower.slice(-4)}</span></div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{(req.amount / 1_000_000).toFixed(2)} <span style={{ fontSize: 14, fontWeight: 500 }}>ALEO</span></div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                           <div className="badge badge-info">Tier {req.risk_level} — {TIER_LABELS[req.risk_level]}</div>
                           <div className="badge badge-indigo">{(req.collateral / 1_000_000).toFixed(2)} ALEO Locked</div>
                        </div>
                      </div>
                      <button className="btn btn-primary" onClick={() => handleApproveLoan(req)} disabled={loading}>
                        {loading ? 'Processing...' : '🚀 Fund Loan'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'request' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            <div className="field">
              <label className="field-label">Current Locked Collateral</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field-input" type="number" step="0.000001" placeholder="Amount to lock" value={collateral} onChange={e => setCollateral(e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={handleLockCollateral} disabled={loading || !collateral}>Lock ALEO</button>
              </div>
            </div>
            
            <div className="field">
              <label className="field-label">Loan Amount (ALEO)</label>
              <input className="field-input" type="number" step="0.000001" placeholder="e.g. 10.0" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>

            <div className="field">
              <label className="field-label">Loan Duration</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {DURATION_PRESETS.map(p => (
                  <button key={p.value} className={`btn ${duration === p.value ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDuration(p.value)} style={{ padding: '6px 12px', fontSize: 12 }}>{p.label}</button>
                ))}
              </div>
            </div>

            {amount && myTier && (
              <div className="preview" style={{ marginBottom: 16, padding: 12, background: 'var(--bg-2)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ color: 'var(--text-3)' }}>Required Collateral:</span><span className="mono">{(parseFloat(amount) * LTV_RATIOS[myTier] / 100).toFixed(4)} ALEO</span></div>
              </div>
            )}

            <button className="btn btn-primary" onClick={handleRequestLoan} disabled={loading || !amount || !myTier} style={{ width: '100%' }}>
              {loading ? 'Processing...' : '🚀 Request Loan'}
            </button>
            
            <button className="btn btn-ghost" onClick={handleUnlockCollateral} style={{ width: '100%', marginTop: 8 }}>🔓 Withdraw Spare Collateral</button>
          </div>
        )}

        {tab === 'repay' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            <div className="field">
              <label className="field-label">LoanAgreement Record (Plaintext)</label>
              <textarea className="field-input" rows="5" placeholder='Paste your unspent LoanAgreement record here...' value={agreementRecordText} onChange={e => setAgreementRecordText(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 11 }} />
            </div>
            <div className="field">
              <label className="field-label">Repayment Amount (ALEO)</label>
              <input className="field-input" type="number" step="0.000001" placeholder="e.g. 10.5" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleRepayLoan} disabled={loading || !agreementRecordText || !repayAmount} style={{ width: '100%' }}>
              {loading ? 'Processing Repayment...' : '💳 Atomic Repay'}
            </button>
          </div>
        )}

        {txState && (
          <div className={`badge badge-${txState.type === 'ok' ? 'success' : txState.type === 'err' ? 'danger' : 'info'}`} style={{ marginTop: 20, width: '100%', whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.5 }}>
            {txState.type === 'pending' && <span className="loader" style={{ marginRight: 8 }}></span>}
            {txState.msg}
          </div>
        )}
      </div>
    </div>
  );
}
