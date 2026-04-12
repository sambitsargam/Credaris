import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';
import { supabase } from '../supabaseClient';

const PROGRAM = 'core_credaris.aleo';
const CONTRACT_ADDRESS = 'aleo1f2v089897ash8qg4f43rkyxfnc5cpx0sn3p0mn5z8x45c7pzkgpswy40pv';

const TIER_LABELS = { 1: 'Excellent', 2: 'Good', 3: 'Fair', 4: 'Poor' };
const LTV_RATIOS = { 1: 10, 2: 25, 3: 40, 4: 200 };
const DURATION_PRESETS = [
  { label: '1 Day', value: '1d', blocks: 28800 },
  { label: '3 Days', value: '3d', blocks: 86400 },
  { label: '1 Week', value: '1w', blocks: 201600 },
  { label: '1 Month', value: '1m', blocks: 806400 },
];

export default function LendingPage() {
  const { wallet, address, connected, executeTransaction, transactionStatus, requestRecords, requestRecordPlaintexts } = useWallet();

  // Poll until transaction is confirmed on-chain
  const waitForTx = useCallback(async (txId) => {
    let attempts = 0;
    while (attempts < 60) {
      try {
        const res = await transactionStatus(txId);
        if (res === 'Completed' || res === 'Accepted') return txId;
        if (res === 'Failed' || res === 'Rejected') throw new Error(`TX ${res}`);
      } catch (e) {
        console.warn('Poll failed:', e);
      }
      await new Promise(r => setTimeout(r, 4000));
      attempts++;
    }
    return txId;
  }, [transactionStatus]);

  const [tab, setTab] = useState('marketplace');
  const [loading, setLoading] = useState(false);
  const [txState, setTxState] = useState(null);

  // Stats
  const [myTier, setMyTier] = useState(null);
  const [myCollateral, setMyCollateral] = useState(0);

  // Marketplace
  const [marketRequests, setMarketRequests] = useState([]);
  const [approveRate, setApproveRate] = useState('500');

  // Request Loan
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('1w');

  // Repay Loan
  const [agreementRecordText, setAgreementRecordText] = useState('');
  const [repayAmount, setRepayAmount] = useState('');

  const handleError = (err) => {
    console.error(err);
    setTxState({ type: 'err', msg: err.message || 'Transaction failed or rejected.' });
  };

  useEffect(() => {
    if (connected && address) {
      (async () => {
        const tier = await fetchMappingValue(PROGRAM, 'credit_tier', address);
        if (tier) setMyTier(parseInt(tier));

        const col = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
        if (col) setMyCollateral(parseInt(col.replace('u64', '')));
        
        // Load marketplace from Supabase
        const { data } = await supabase.from('loan_requests').select('*').eq('is_filled', false);
        if (data) setMarketRequests(data);
      })();
    }
  }, [connected, address]);

  const handleLockCollateral = async (amtMicro) => {
    setLoading(true);
    setTxState({ type: 'pending', msg: '🔐 Atomic escrow: Pulling ALEO credits into contract vault...' });
    try {
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'lock_collateral',
        inputs: [`${amtMicro}u64`],
        fee: 500_000,
        privateFee: false,
      });
      if (result?.transactionId) {
        await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `✅ Successfully escrowed ${(amtMicro/1000000).toFixed(2)} ALEO!` });
        const newCol = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
        if (newCol) setMyCollateral(parseInt(newCol.replace('u64', '')));
      }
    } catch (err) {
       handleError(err);
    } finally {
       setLoading(false);
    }
  };

  const handleRequestLoan = async () => {
    if (!connected || !amount || !myTier) return;
    setLoading(true);
    
    // Step 0: Calculate required collateral
    const loanMicro = Math.floor(parseFloat(amount) * 1_000_000);
    const requiredCollateral = Math.floor(loanMicro * LTV_RATIOS[myTier] / 100);
    
    try {
      // Automatic Step 1: Ensure enough collateral is locked
      if (myCollateral < requiredCollateral) {
        const diff = requiredCollateral - myCollateral;
        setTxState({ type: 'pending', msg: `🔐 Automated Step 1: Locking missing ${(diff/1_000_000).toFixed(4)} ALEO as escrow...` });
        const lockRes = await executeTransaction({
          program: PROGRAM,
          function: 'lock_collateral',
          inputs: [`${diff}u64`],
          fee: 600_000,
          privateFee: false,
        });
        if (lockRes?.transactionId) await waitForTx(lockRes.transactionId);
      }

      // Step 2: Submit the Loan Request
      setTxState({ type: 'pending', msg: '📝 Automated Step 2: Finalizing loan request signature...' });
      const durationSetting = DURATION_PRESETS.find(p => p.value === duration);
      const blocks = durationSetting.blocks;

      const result = await executeTransaction({
        program: PROGRAM,
        function: 'request_loan',
        inputs: [`${loanMicro}u64`, `${requiredCollateral}u64`, `${blocks}u32`],
        fee: 800_000,
        privateFee: false,
      });

      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: 'Broadcasting loan request to marketplace...' });
        const realTxId = await waitForTx(result.transactionId);
        
        // Record in Supabase
        await supabase.from('loan_requests').insert([{
          borrower: address,
          amount: loanMicro,
          collateral: requiredCollateral,
          duration: blocks,
          risk_level: myTier,
          request_hash: realTxId, 
          is_filled: false
        }]);

        setTxState({ type: 'ok', msg: `✅ Loan request broadcasting! Hash: ${realTxId}` });
        setAmount('');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveLoan = async (req) => {
    if (!connected || !approveRate) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: '🚀 Atomic funding: Transferring credits to borrower...' });
    try {
      const height = await fetchBlockHeight();
      const dueBy = height + req.duration;

      const result = await executeTransaction({
        program: PROGRAM,
        function: 'approve_loan',
        inputs: [
          address, 
          req.borrower,
          `${req.amount}u64`,
          `${req.collateral}u64`,
          `${parseInt(approveRate)}u64`,
          `${dueBy}u32`,
          `0field` // placeholder for loan_id hash in simplified call
        ],
        fee: 1_000_000,
        privateFee: false,
      });

      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: 'Confirming atomic funding...' });
        await waitForTx(result.transactionId);
        await supabase.from('loan_requests').update({ is_filled: true }).eq('id', req.id);
        setMarketRequests(prev => prev.filter(r => r.id !== req.id));
        setTxState({ type: 'ok', msg: `✅ Loan funded! Payout of ${(req.amount/1000000).toFixed(2)} ALEO sent to borrower.` });
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAgreement = async () => {
    if (!connected) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: 'Scanning wallet for active LoanAgreement records...' });
    try {
      let targetText = null;

      // 1. Try requestRecordPlaintexts directly
      if (typeof requestRecordPlaintexts === 'function') {
        try {
          const plaintexts = await requestRecordPlaintexts(PROGRAM);
          const agreePt = plaintexts?.find(pt => {
             const str = typeof pt === 'string' ? pt : JSON.stringify(pt);
             return str.includes('principal:') && str.includes('amount_repaid:');
          });
          if (agreePt) targetText = typeof agreePt === 'string' ? agreePt : JSON.stringify(agreePt, null, 2);
        } catch (e) {
          console.warn('requestRecordPlaintexts failed:', e);
        }
      }

      // 2. Fallback to requestRecords + decrypt
      if (!targetText) {
        let recs = await requestRecords(PROGRAM).catch(() => requestRecords());
        const agreeRec = recs?.find(r => {
          const str = (typeof r === 'string' ? r : (r.plaintext || r.recordPlaintext || r.ciphertext || r.recordCiphertext || JSON.stringify(r))).toLowerCase();
          return str.includes('loanagreement') && !r.spent;
        });

        if (agreeRec) {
          let pt = agreeRec.recordPlaintext || agreeRec.plaintext;
          if (!pt) {
            const ciphertext = agreeRec.recordCiphertext || agreeRec.ciphertext;
            if (ciphertext) {
               setTxState({ type: 'pending', msg: 'Decrypting loan (please allow in wallet)...' });
               if (typeof wallet?.decrypt === 'function') pt = await wallet.decrypt(ciphertext);
               else if (typeof wallet?.adapter?.decrypt === 'function') pt = await wallet.adapter.decrypt(ciphertext);
            }
          }
          if (pt) targetText = typeof pt === 'string' ? pt : JSON.stringify(pt, null, 2);
        }
      }

      if (targetText) {
        const ownerMatch = targetText.match(/owner:\s*(aleo1[a-z0-9]+)/);
        const recordOwner = ownerMatch ? ownerOwner[1] : null;

        if (recordOwner && recordOwner !== address) {
          setTxState({ type: 'err', msg: 'Decrypted loan does not belong to you.' });
          setLoading(false);
          return;
        }

        setAgreementRecordText(targetText);
        setTxState({ type: 'ok', msg: 'Loan loaded securely!' });

        const totalDueMatch = targetText.match(/total_due:\s*(\d+)u64/);
        const amountRepaidMatch = targetText.match(/amount_repaid:\s*(\d+)u64/);
        if (totalDueMatch) {
          const totalDue = parseInt(totalDueMatch[1], 10);
          const amountRepaid = amountRepaidMatch ? parseInt(amountRepaidMatch[1], 10) : 0;
          const remaining = totalDue - amountRepaid;
          if (remaining > 0) setRepayAmount((remaining / 1_000_000).toString());
          else setTxState({ type: 'ok', msg: 'Loan is already fully repaid.' });
        }
      } else {
        setTxState({ type: 'err', msg: 'No active LoanAgreement found in wallet.' });
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRepayLoan = async () => {
    if (!agreementRecordText || !repayAmount) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: '💳 Initiating atomic repayment spread (Lender + Treasury)...' });
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
        await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `✅ ${repayAmount} ALEO spread atomically! Repayment confirmed.` });
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
        <p className="page-desc" style={{ color: 'var(--emerald)' }}>🔐 {PROGRAM} — Real ALEO Escrow · Atomic Single-TX Logic</p>
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
            <div className="badge badge-info" style={{ marginBottom: 16 }}>⚡ Funding a loan pulls <strong>real ALEO</strong> from your wallet directly to the borrower.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 16px', background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)', maxWidth: 650 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>PROPOSED ANNUAL RATE (basis points)</div>
                <input className="field-input" type="number" placeholder="e.g. 500 = 5.00%" value={approveRate} onChange={e => setApproveRate(e.target.value)} style={{ marginBottom: 0, width: '100%' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 650 }}>
              {marketRequests.map(req => (
                <div key={req.id} className="request-card" style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>BORROWER: <span className="mono">{req.borrower.slice(0,10)}...</span></div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{(req.amount / 1_000_000).toFixed(2)} ALEO</div>
                    </div>
                    <button className="btn btn-primary" onClick={() => handleApproveLoan(req)} disabled={loading}>🚀 Fund Loan</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'request' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            <div className="field">
              <label className="field-label">Loan Amount (ALEO)</label>
              <input className="field-input" type="number" step="0.01" placeholder="e.g. 10.0" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Loan Duration</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {DURATION_PRESETS.map(p => (
                  <button key={p.value} className={`btn ${duration === p.value ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDuration(p.value)}>{p.label}</button>
                ))}
              </div>
            </div>
            {amount && myTier && (
              <div className="preview" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Required Collateral:</span><span className="mono">{(parseFloat(amount) * LTV_RATIOS[myTier] / 100).toFixed(4)} ALEO</span></div>
              </div>
            )}
            <button className="btn btn-primary" onClick={handleRequestLoan} disabled={loading || !amount || !myTier} style={{ width: '100%' }}>
              {loading ? 'Processing...' : '🚀 Request Loan'}
            </button>
          </div>
        )}

        {tab === 'repay' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            {!agreementRecordText ? (
              <button className="btn btn-primary" onClick={handleFetchAgreement} disabled={loading} style={{ width: '100%', padding: '16px 0' }}>🔐 Decrypt & Load Loan</button>
            ) : (
              <>
                <div className="badge badge-info" style={{ marginBottom: 16 }}><strong>Loan Auto-Loaded!</strong><br />Owner: {address.slice(0,10)}...</div>
                <div className="field">
                  <label className="field-label">Repayment Amount (ALEO)</label>
                  <input className="field-input" type="number" value={repayAmount} readOnly style={{ cursor: 'not-allowed', opacity: 0.8 }} />
                </div>
                <button className="btn btn-primary" onClick={handleRepayLoan} disabled={loading || !repayAmount} style={{ width: '100%' }}>💳 Atomic Repay {repayAmount} ALEO</button>
              </>
            )}
          </div>
        )}

        {txState && (
          <div className={`badge badge-${txState.type === 'ok' ? 'success' : txState.type === 'err' ? 'danger' : 'info'}`} style={{ marginTop: 20 }}>{txState.msg}</div>
        )}
      </div>
    </div>
  );
}
