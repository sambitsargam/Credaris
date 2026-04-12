import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { useLocation } from 'react-router-dom';
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
  { label: '3 Months', value: '3m', blocks: 2419200 },
  { label: '6 Months', value: '6m', blocks: 4838400 },
];
const BLOCKS_PER_MONTH = 806400;

// ═══ REUSABLE STEP PROGRESS COMPONENT ═══
function StepProgress({ steps, message, status }) {
  if (!steps || steps.length === 0) return null;
  return (
    <div className="step-progress">
      <div className="step-progress-header">🔒 Secure Multi-Step Transaction</div>
      <div className="step-progress-track">
        {steps.map((step, i) => {
          const state = step.state; // 'pending' | 'active' | 'done'
          const connectorState = i < steps.length - 1
            ? (steps[i + 1].state === 'done' || steps[i + 1].state === 'active' ? (step.state === 'done' ? 'done' : 'active') : '')
            : null;
          return (
            <React.Fragment key={i}>
              <div className="step-node">
                <div className={`step-circle ${state}`}>
                  {state === 'done' ? '✓' : state === 'active' ? <span className="spin" style={{ width: 16, height: 16, borderWidth: 2 }} /> : i + 1}
                </div>
                <div className={`step-label ${state}`}>{step.label}</div>
              </div>
              {connectorState !== null && (
                <div className={`step-connector ${connectorState}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {message && (
        <div className={`step-progress-msg${status === 'ok' ? ' success' : status === 'err' ? ' error' : ''}`}>
          {status === 'pending' && <span className="spin" style={{ width: 14, height: 14, borderWidth: 2 }} />}
          {status === 'ok' && '✅'}
          {status === 'err' && '❌'}
          {message}
        </div>
      )}
    </div>
  );
}

export default function LendingPage() {
  const { wallet, address, connected, decrypt, executeTransaction, transactionStatus, requestRecords, requestRecordPlaintexts } = useWallet();

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
  const [stepProgress, setStepProgress] = useState(null); // { steps: [...], message, status }
  
  const location = useLocation();
  const hashToTab = { '#browse': 'marketplace', '#borrow': 'request', '#repay': 'repay' };
  const initialTab = hashToTab[location.hash] || 'marketplace';
  const [tab, setTab] = useState(initialTab);

  // Sync tab when hash changes (sidebar click)
  useEffect(() => {
    const t = hashToTab[location.hash];
    if (t && t !== tab) setTab(t);
  }, [location.hash]);

  const [marketRequests, setMarketRequests] = useState([]);
  
  // Request Loan inputs
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('1w');
  const [customMonths, setCustomMonths] = useState('');
  const [myTier, setMyTier] = useState(null);
  const [lockedCollateral, setLockedCollateral] = useState(0);
  
  // Repayment — decrypted loan agreements
  const [myLoans, setMyLoans] = useState([]);
  const [decryptingLoans, setDecryptingLoans] = useState(false);
  const [repayAmounts, setRepayAmounts] = useState({}); // { loanId: amount }
  
  // Approve inputs
  const [approveRate, setApproveRate] = useState('500');

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

      const colVal = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
      if (colVal) setLockedCollateral(parseInt(colVal.replace(/u\d+$/g, ''), 10) || 0);
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

  // Helper to parse a plaintext record string into an object
  const parseRecordFields = (rawRecord) => {
    const fields = {};
    // Keep original for passing to executeTransaction
    fields._original = rawRecord;
    
    const str = typeof rawRecord === 'string' ? rawRecord : JSON.stringify(rawRecord);
    fields._raw = str;
    
    const ownerMatch = str.match(/owner:\s*(aleo1[a-z0-9]+)/);
    if (ownerMatch) fields.owner = ownerMatch[1];

    const borrowerMatch = str.match(/borrower:\s*(aleo1[a-z0-9]+)/);
    if (borrowerMatch) fields.borrower = borrowerMatch[1];

    const lenderMatch = str.match(/lender:\s*(aleo1[a-z0-9]+)/);
    if (lenderMatch) fields.lender = lenderMatch[1];

    const principalMatch = str.match(/principal:\s*(\d+)u64/);
    if (principalMatch) fields.principal = parseInt(principalMatch[1]);

    const interestMatch = str.match(/interest_rate:\s*(\d+)u64/);
    if (interestMatch) fields.interest_rate = parseInt(interestMatch[1]);

    const collateralMatch = str.match(/collateral:\s*(\d+)u64/);
    if (collateralMatch) fields.collateral = parseInt(collateralMatch[1]);

    const totalDueMatch = str.match(/total_due:\s*(\d+)u64/);
    if (totalDueMatch) fields.total_due = parseInt(totalDueMatch[1]);

    const repaidMatch = str.match(/amount_repaid:\s*(\d+)u64/);
    if (repaidMatch) fields.amount_repaid = parseInt(repaidMatch[1]);

    const dueByMatch = str.match(/due_by:\s*(\d+)u32/);
    if (dueByMatch) fields.due_by = parseInt(dueByMatch[1]);

    // is_active may have .private suffix
    const activeMatch = str.match(/is_active:\s*(true|false)/);
    if (activeMatch) fields.is_active = activeMatch[1] === 'true';

    const loanIdMatch = str.match(/loan_id:\s*([^\s,{}]+field)/);
    if (loanIdMatch) fields.loan_id = loanIdMatch[1].replace('.private', '').replace('.public', '');

    return fields;
  };

  // ═══════════════════════════════════════════
  // DECRYPT LOAN AGREEMENTS
  // ═══════════════════════════════════════════
  const handleDecryptLoans = async () => {
    if (!connected) return;
    setDecryptingLoans(true);
    setTxState({ type: 'pending', msg: '🔐 Decrypting your private loan records from wallet...' });
    try {
      const allLoans = [];

      if (typeof requestRecords === 'function') {
        const allWalletRecords = await requestRecords(PROGRAM);
        console.log('Total wallet records:', allWalletRecords?.length);

        // Filter to LoanAgreement records that are unspent
        const loanRecords = allWalletRecords?.filter(r => r.recordName === 'LoanAgreement' && !r.spent) || [];
        console.log('LoanAgreement unspent records:', loanRecords.length);

        if (loanRecords.length > 0) {
          // BATCH APPROACH: Decrypt all at once with a single wallet prompt
          let batchPlaintexts = null;
          if (typeof requestRecordPlaintexts === 'function') {
            try {
              batchPlaintexts = await requestRecordPlaintexts(PROGRAM);
              console.log('Batch plaintexts returned:', batchPlaintexts?.length);
            } catch (e) {
              console.log('Batch decrypt failed, falling back to single:', e);
            }
          }

          if (batchPlaintexts && batchPlaintexts.length > 0) {
            // Parse batch plaintexts — find LoanAgreements owned by this user
            for (const pt of batchPlaintexts) {
              const ptStr = typeof pt === 'string' ? pt : (pt?.recordPlaintext || pt?.plaintext || JSON.stringify(pt));
              if (!ptStr || !ptStr.includes('principal') || !ptStr.includes('total_due')) continue;

              const parsed = parseRecordFields(ptStr);
              parsed._original = ptStr;
              parsed._raw = ptStr;

              // STRICT: Only show repay if BORROWER matches connected wallet
              // (Lender also has a copy but shouldn't see repay)
              if (parsed.borrower !== address) continue;
              if (parsed.is_active === false) continue;
              if (parsed.principal && parsed.total_due) {
                allLoans.push(parsed);
              }
            }
          } else {
            // SINGLE DECRYPT FALLBACK: Only decrypt the FIRST loan record
            const rec = loanRecords[0];
            let plaintext = null;

            const textSources = [rec.plaintext, rec.recordPlaintext, rec.data];
            for (const src of textSources) {
              if (!src) continue;
              const text = typeof src === 'string' ? src : JSON.stringify(src);
              if (text.includes('principal') && text.includes('total_due')) {
                plaintext = text;
                break;
              }
            }

            if (!plaintext) {
              const ciphertext = rec.recordCiphertext || rec.ciphertext;
              if (ciphertext) {
                if (typeof decrypt === 'function') {
                  try { plaintext = await decrypt(ciphertext); } catch (e) { console.log('decrypt hook failed:', e); }
                }
                if (!plaintext && typeof wallet?.decrypt === 'function') {
                  try { plaintext = await wallet.decrypt(ciphertext); } catch (e) { console.log('wallet.decrypt failed:', e); }
                }
                if (!plaintext && typeof wallet?.adapter?.decrypt === 'function') {
                  try { plaintext = await wallet.adapter.decrypt(ciphertext); } catch (e) { console.log('wallet.adapter.decrypt failed:', e); }
                }
              }
            }

            if (plaintext) {
              const ptStr = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
              const parsed = parseRecordFields(ptStr);
              parsed._original = ptStr;
              parsed._raw = ptStr;

              // STRICT: only borrower can repay
              if (parsed.borrower === address && parsed.is_active !== false && parsed.principal && parsed.total_due) {
                allLoans.push(parsed);
              }
            }
          }
        }
      }

      console.log('Active loans found for user:', allLoans.length);
      setMyLoans(allLoans);

      if (allLoans.length === 0) {
        setTxState({ type: 'ok', msg: `✅ You don't have any active loans to repay. You're all clear!` });
      } else {
        setTxState({ type: 'ok', msg: `Found ${allLoans.length} active loan${allLoans.length > 1 ? 's' : ''} to repay.` });
      }
    } catch (e) {
      console.error('Decrypt error:', e);
      setTxState({ type: 'err', msg: `Decryption failed: ${e.message}` });
    } finally {
      setDecryptingLoans(false);
    }
  };

  // ═══════════════════════════════════════════
  // BORROWER: Lock Collateral (Atomic pull)
  // ═══════════════════════════════════════════
  const handleUnlockCollateral = async () => {
    if (!connected) return;
    setLoading(true);
    setStepProgress(null);
    setTxState(null);
    try {
      const existingRaw = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
      const existing = existingRaw ? parseInt(existingRaw.replace(/u\d+$/g, ''), 10) : 0;
      
      if (existing === 0) {
        setTxState({ type: 'err', msg: 'No collateral locked. Nothing to withdraw.' });
        setLoading(false);
        return;
      }

      setStepProgress({
        steps: [
          { label: 'Verify Balance', state: 'done' },
          { label: 'Withdraw', state: 'active' },
        ],
        message: `Withdrawing ${(existing/1_000_000).toFixed(4)} ALEO from escrow...`,
        status: 'pending',
      });

      const result = await executeTransaction({
        program: PROGRAM,
        function: 'unlock_collateral',
        inputs: [`${existing}u64`],
        fee: 600_000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setStepProgress(sp => ({ ...sp, message: 'Confirming on blockchain...' }));
        const realTxId = await waitForTx(result.transactionId);
        setStepProgress({
          steps: [
            { label: 'Verify Balance', state: 'done' },
            { label: 'Withdraw', state: 'done' },
          ],
          message: `✅ ${(existing/1_000_000).toFixed(4)} ALEO returned to your wallet!`,
          status: 'ok',
        });
        setLockedCollateral(0);
      }
    } catch (err) {
      setStepProgress(sp => sp ? ({ ...sp, message: err.message || 'Unlock failed', status: 'err' }) : null);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // BORROWER: Request a Loan (auto 2-step)
  // ═══════════════════════════════════════════
  const handleRequestLoan = async () => {
    if (!connected || !amount || !myTier) return;
    setLoading(true);
    setStepProgress(null);

    try {
      const amountMicro = Math.floor(parseFloat(amount) * 1_000_000);
      const ratio = LTV_RATIOS[myTier] || 200;
      const requiredCollateralMicro = Math.ceil(amountMicro * ratio / 100);
      const nonce = `${Math.floor(Math.random() * 1_000_000_000)}field`;

      const preset = DURATION_PRESETS.find(p => p.value === duration);
      const durationBlocks = duration === 'custom'
        ? Math.floor(parseFloat(customMonths || '1') * BLOCKS_PER_MONTH)
        : (preset ? preset.blocks : 201600);
      const blockHeightRes = await fetchBlockHeight();
      const currentBlock = typeof blockHeightRes === 'number' ? blockHeightRes : parseInt(blockHeightRes, 10);
      const dueByBlock = currentBlock + durationBlocks;

      // Auto-check existing collateral
      const existingRaw = await fetchMappingValue(PROGRAM, 'locked_collateral', address);
      const existingCol = existingRaw ? parseInt(existingRaw.replace(/u\d+$/g, ''), 10) : 0;

      // Init step progress
      const needsCollateral = existingCol < requiredCollateralMicro;
      setStepProgress({
        steps: [
          { label: 'Lock Collateral', state: needsCollateral ? 'active' : 'done' },
          { label: 'Submit Request', state: 'pending' },
        ],
        message: needsCollateral ? 'Securing your collateral on-chain...' : 'Collateral already locked ✓',
        status: 'pending',
      });
      setTxState(null);

      // Auto Step 1: Lock missing collateral
      if (needsCollateral) {
        const diff = requiredCollateralMicro - existingCol;
        setStepProgress(sp => ({ ...sp, message: `Locking ${(diff / 1_000_000).toFixed(4)} ALEO as collateral...`, status: 'pending' }));
        const lockResult = await executeTransaction({
          program: PROGRAM,
          function: 'lock_collateral',
          inputs: [`${diff}u64`],
          fee: 600_000,
          privateFee: false,
        });
        if (!lockResult?.transactionId) throw new Error('Collateral lock failed');
        setStepProgress(sp => ({ ...sp, message: 'Confirming collateral on blockchain...' }));
        await waitForTx(lockResult.transactionId);
      }

      // Step 1 done, Step 2 active
      setStepProgress({
        steps: [
          { label: 'Lock Collateral', state: 'done' },
          { label: 'Submit Request', state: 'active' },
        ],
        message: 'Preparing your loan request...',
        status: 'pending',
      });

      // Compute real on-chain hash
      const { computeRequestHash } = await import('../utils/aleoHash.js');
      const actualRequestHash = await computeRequestHash(amountMicro, dueByBlock, requiredCollateralMicro, nonce, address);

      // Auto Step 2: Submit loan request
      setStepProgress(sp => ({ ...sp, message: 'Submitting your loan request...' }));
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'request_loan',
        inputs: [`${amountMicro}u64`, `${dueByBlock}u32`, `${requiredCollateralMicro}u64`, nonce],
        fee: 600_000,
        privateFee: false,
      });
      if (!result?.transactionId) throw new Error('Loan request failed');

      setStepProgress(sp => ({ ...sp, message: 'Confirming on blockchain...' }));
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

      // Both steps done!
      setStepProgress({
        steps: [
          { label: 'Lock Collateral', state: 'done' },
          { label: 'Submit Request', state: 'done' },
        ],
        message: '🎉 Loan request created successfully! Lenders can now fund it.',
        status: 'ok',
      });
      setAmount('');
      fetchMarketplace();
      fetchUserStatus();

    } catch (err) {
      setStepProgress(sp => sp ? ({ ...sp, message: err.message || 'Transaction failed', status: 'err' }) : null);
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
    if (reqPayload.borrower === address) {
      setTxState({ type: 'err', msg: '⛔ Cannot fund your own loan.' });
      return;
    }

    setLoading(true);
    setStepProgress(null);
    setTxState(null);
    try {
      const principalAleo = (reqPayload.amount / 1_000_000).toFixed(4);
      const { computeRequestHash } = await import('../utils/aleoHash.js');
      const nonceStr = String(reqPayload.nonce).endsWith('field') ? reqPayload.nonce : `${reqPayload.nonce}field`;

      setStepProgress({
        steps: [
          { label: 'Verify Request', state: 'active' },
          { label: 'Fund Loan', state: 'pending' },
        ],
        message: 'Verifying loan request on-chain...',
        status: 'pending',
      });

      const recomputedHash = await computeRequestHash(reqPayload.amount, reqPayload.duration, reqPayload.collateral, nonceStr, reqPayload.borrower);

      setStepProgress({
        steps: [
          { label: 'Verify Request', state: 'done' },
          { label: 'Fund Loan', state: 'active' },
        ],
        message: `Funding ${principalAleo} ALEO — sign to approve...`,
        status: 'pending',
      });

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
        setStepProgress(sp => ({ ...sp, message: 'Confirming on blockchain...' }));
        const realTxId = await waitForTx(approveResult.transactionId);
        await supabase.from('loan_requests').delete().eq('request_hash', reqPayload.request_hash);
        fetchMarketplace();
        setStepProgress({
          steps: [
            { label: 'Verify Request', state: 'done' },
            { label: 'Fund Loan', state: 'done' },
          ],
          message: `🎉 Loan funded! ${principalAleo} ALEO sent to borrower.`,
          status: 'ok',
        });
      }
    } catch (err) {
      setStepProgress(sp => sp ? ({ ...sp, message: err.message || 'Funding failed', status: 'err' }) : null);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  // BORROWER: Repay a Loan (from decrypted record)
  // ═══════════════════════════════════════════
  const handleRepayLoan = async (loan) => {
    const repayAleo = repayAmounts[loan.loan_id];
    if (!connected || !repayAleo) return;
    
    const recordInput = typeof loan._original === 'string' ? loan._original : loan._raw;
    if (!recordInput) {
      setTxState({ type: 'err', msg: 'Record data missing. Try decrypting again.' });
      return;
    }
    
    setLoading(true);
    setStepProgress(null);
    setTxState(null);

    setStepProgress({
      steps: [
        { label: 'Submit Payment', state: 'active' },
        { label: 'Confirm', state: 'pending' },
      ],
      message: `Submitting ${repayAleo} ALEO repayment...`,
      status: 'pending',
    });

    try {
      const repayMicro = Math.floor(parseFloat(repayAleo) * 1_000_000);
      console.log('Repay inputs:', { recordInput: recordInput.substring(0, 100) + '...', amount: `${repayMicro}u64` });
      
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'repay_loan',
        inputs: [recordInput, `${repayMicro}u64`],
        fee: 800_000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setStepProgress({
          steps: [
            { label: 'Submit Payment', state: 'done' },
            { label: 'Confirm', state: 'active' },
          ],
          message: 'Confirming on blockchain...',
          status: 'pending',
        });
        const realTxId = await waitForTx(result.transactionId);
        
        const remaining = ((loan.total_due - loan.amount_repaid) / 1_000_000) - parseFloat(repayAleo);
        const isFullyPaid = remaining <= 0.000001;
        
        setStepProgress({
          steps: [
            { label: 'Submit Payment', state: 'done' },
            { label: 'Confirm', state: 'done' },
          ],
          message: isFullyPaid
            ? `🎉 Loan fully repaid! Collateral of ${(loan.collateral / 1_000_000).toFixed(4)} ALEO unlocked.`
            : `✅ Payment of ${repayAleo} ALEO confirmed. ${remaining.toFixed(4)} ALEO remaining.`,
          status: 'ok',
        });
        
        setRepayAmounts(prev => ({ ...prev, [loan.loan_id]: '' }));
        setTimeout(() => handleDecryptLoans(), 2000);
      }
    } catch (err) {
      setStepProgress(sp => sp ? ({ ...sp, message: err.message || 'Repayment failed', status: 'err' }) : null);
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // Manual repay fallback (paste record)
  const [manualRecord, setManualRecord] = useState('');
  const [manualRepayAmt, setManualRepayAmt] = useState('');
  const handleManualRepay = async () => {
    if (!connected || !manualRecord || !manualRepayAmt) return;
    setLoading(true);
    setTxState({ type: 'pending', msg: `Submitting ${manualRepayAmt} ALEO repayment...` });
    try {
      const repayMicro = Math.floor(parseFloat(manualRepayAmt) * 1_000_000);
      const result = await executeTransaction({
        program: PROGRAM,
        function: 'repay_loan',
        inputs: [manualRecord.trim(), `${repayMicro}u64`],
        fee: 800_000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: 'Broadcasting atomic repayment...' });
        const realTxId = await waitForTx(result.transactionId);
        setTxState({ type: 'ok', msg: `✅ ${manualRepayAmt} ALEO atomically repaid! TX: ${realTxId}` });
        setManualRecord('');
        setManualRepayAmt('');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // Computed values for Request tab
  const requiredCollateral = amount && myTier ? (parseFloat(amount) * LTV_RATIOS[myTier] / 100) : 0;
  const preset = DURATION_PRESETS.find(p => p.value === duration);

  if (!connected) {
    return (
      <div className="app-layout">
        <div className="card" style={{ textAlign: 'center', padding: '60px 32px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏦</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: 'var(--text-0)' }}>Connect to Marketplace</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, maxWidth: 380, margin: '0 auto' }}>Connect your wallet to browse, request, and fund loans on the Credaris protocol.</p>
          <div className="trust-badges" style={{ justifyContent: 'center', marginTop: 20 }}>
            <span className="trust-badge"><span className="trust-badge-icon">🔒</span> ZK Secured</span>
            <span className="trust-badge"><span className="trust-badge-icon">⚡</span> Atomic</span>
            <span className="trust-badge"><span className="trust-badge-icon">🧠</span> Private</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">Lending Marketplace</h1>
        <p className="page-desc">Borrow, lend, and repay — all secured by zero-knowledge proofs on Aleo.</p>
      </div>

      <div className="card">
        <div className="card-head" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'marketplace', hash: '#browse', label: '🏪 Browse Loans' },
            { key: 'request', hash: '#borrow', label: '📝 Borrow' },
            { key: 'repay', hash: '#repay', label: '💳 Repay' },
          ].map(t => (
            <button key={t.key} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTab(t.key); setTxState(null); window.history.replaceState(null, '', `/lending${t.hash}`); }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══ MARKETPLACE TAB ═══ */}
        {tab === 'marketplace' && (
          <div style={{ marginTop: 16 }}>
            <div className="badge badge-info" style={{ marginBottom: 16 }}>⚡ Fund a loan and earn <strong>5.00% APR</strong> — funds are transferred atomically in one transaction.</div>

            {marketRequests.length === 0 ? (
               <div className="empty">
                 <div className="empty-icon">🚀</div>
                 <p style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>No active loan requests yet</p>
                 <p style={{ color: 'var(--text-4)', fontSize: 13 }}>Better credit score = lower collateral. Be the first to request or fund a loan.</p>
               </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 650 }}>
                {marketRequests.map(req => (
                  <div key={req.request_hash} style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--border)' }}>
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

        {/* ═══ REQUEST LOAN TAB ═══ */}
        {tab === 'request' && (
          <div style={{ maxWidth: 500, marginTop: 16 }}>
            {myTier ? (
              <div className="badge badge-info" style={{ marginBottom: 16, display: 'block', padding: '8px 12px' }}>
                Your credit tier: <strong>{TIER_LABELS[myTier]}</strong> — Collateral ratio: <strong>{LTV_RATIOS[myTier]}%</strong>
              </div>
            ) : (
              <div className="badge badge-danger" style={{ marginBottom: 16, display: 'block', padding: '8px 12px' }}>
                ⚠️ No credit score found. Please generate your ZK Credit Score first.
              </div>
            )}

            <div className="field">
              <label className="field-label">Loan Amount (ALEO)</label>
              <input className="field-input" type="number" step="0.000001" placeholder="e.g. 10.0" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>

            <div className="field">
              <label className="field-label">Loan Duration</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DURATION_PRESETS.map(p => (
                  <button key={p.value} className={`btn ${duration === p.value ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDuration(p.value)} style={{ padding: '6px 12px', fontSize: 12 }}>{p.label}</button>
                ))}
                <button className={`btn ${duration === 'custom' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDuration('custom')} style={{ padding: '6px 12px', fontSize: 12 }}>Custom</button>
              </div>
              {duration === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input className="field-input" type="number" min="1" max="24" step="1" placeholder="e.g. 2" value={customMonths} onChange={e => setCustomMonths(e.target.value)} style={{ width: 80, marginBottom: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>month{customMonths !== '1' ? 's' : ''}</span>
                  {customMonths && <span style={{ fontSize: 11, color: 'var(--text-4)' }}>≈ {(parseFloat(customMonths) * BLOCKS_PER_MONTH).toLocaleString()} blocks</span>}
                </div>
              )}
            </div>

            {/* Auto-computed collateral preview */}
            {amount && myTier && (
              <div style={{ marginBottom: 16, padding: 16, background: 'var(--bg-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>Loan Summary</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-3)' }}>Loan Amount</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{parseFloat(amount).toFixed(4)} ALEO</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-3)' }}>Duration</span>
                  <span className="mono">{duration === 'custom' ? `${customMonths || '1'} month${customMonths !== '1' ? 's' : ''}` : (preset?.label || duration)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-3)' }}>Collateral Ratio</span>
                  <span className="mono">{LTV_RATIOS[myTier]}%</span>
                </div>
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>Required Collateral</span>
                  <span className="mono" style={{ fontWeight: 700, color: 'var(--emerald)' }}>{requiredCollateral.toFixed(4)} ALEO</span>
                </div>
                {lockedCollateral > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                    <span style={{ color: 'var(--text-4)' }}>Already locked in vault</span>
                    <span className="mono" style={{ color: 'var(--text-3)' }}>{(lockedCollateral / 1_000_000).toFixed(4)} ALEO</span>
                  </div>
                )}
              </div>
            )}

            <button className="btn btn-primary" onClick={handleRequestLoan} disabled={loading || !amount || !myTier} style={{ width: '100%' }}>
              {loading ? '⛓ Submitting to blockchain...' : '🚀 Request Loan'}
            </button>
            <div className="trust-badges" style={{ justifyContent: 'center' }}>
              <span className="trust-badge"><span className="trust-badge-icon">🔒</span> ZK Secured</span>
              <span className="trust-badge"><span className="trust-badge-icon">⚡</span> Atomic</span>
            </div>
            
            {lockedCollateral > 0 && (
              <button className="btn btn-ghost" onClick={handleUnlockCollateral} style={{ width: '100%', marginTop: 8 }}>
                🔓 Withdraw Spare Collateral ({(lockedCollateral / 1_000_000).toFixed(4)} ALEO)
              </button>
            )}
          </div>
        )}

        {/* ═══ REPAY LOAN TAB ═══ */}
        {tab === 'repay' && (
          <div style={{ maxWidth: 550, marginTop: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary" onClick={handleDecryptLoans} disabled={decryptingLoans} style={{ width: '100%' }}>
                {decryptingLoans ? '🔐 Decrypting...' : '🔐 Decrypt Your Loans'}
              </button>
              <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 6, textAlign: 'center' }}>
                Your wallet will prompt you to decrypt your private LoanAgreement records.
              </div>
            </div>

            {myLoans.length === 0 && !decryptingLoans && (
              <div className="empty" style={{ padding: 32 }}>
                <div className="empty-icon">📄</div>
                <p>Click "Decrypt Your Loans" to reveal active loan agreements from your wallet.</p>
              </div>
            )}

            {myLoans.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {myLoans.map((loan, idx) => {
                  const remaining = (loan.total_due - loan.amount_repaid) / 1_000_000;
                  const progress = loan.total_due > 0 ? (loan.amount_repaid / loan.total_due) * 100 : 0;
                  const repayVal = repayAmounts[loan.loan_id] || '';
                  
                  return (
                    <div key={loan.loan_id || idx} style={{ padding: 16, background: 'var(--bg-3)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase', fontWeight: 600 }}>Active Loan</div>
                        <div className="badge badge-info" style={{ fontSize: 10 }}>
                          {(loan.interest_rate / 100).toFixed(2)}% APR
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-3)' }}>Principal</span>
                        <span className="mono" style={{ fontWeight: 600 }}>{(loan.principal / 1_000_000).toFixed(4)} ALEO</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-3)' }}>Lender</span>
                        <span className="mono" style={{ fontSize: 11 }}>{loan.lender?.slice(0,10)}...{loan.lender?.slice(-4)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-3)' }}>Collateral Locked</span>
                        <span className="mono">{(loan.collateral / 1_000_000).toFixed(4)} ALEO</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-3)' }}>Due By Block</span>
                        <span className="mono">#{loan.due_by?.toLocaleString()}</span>
                      </div>

                      <div style={{ margin: '12px 0 8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: 'var(--text-4)' }}>Repayment Progress</span>
                          <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>{progress.toFixed(1)}%</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--bg-1)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--emerald)', borderRadius: 3, transition: 'width 0.3s ease' }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 12 }}>
                        <span style={{ color: 'var(--rose)', fontWeight: 600 }}>Remaining</span>
                        <span className="mono" style={{ fontWeight: 700, color: 'var(--rose)' }}>{remaining.toFixed(4)} ALEO</span>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          className="field-input"
                          type="number"
                          step="0.000001"
                          placeholder={`Max: ${remaining.toFixed(4)}`}
                          value={repayVal}
                          onChange={e => setRepayAmounts(prev => ({ ...prev, [loan.loan_id]: e.target.value }))}
                          style={{ flex: 1, marginBottom: 0 }}
                        />
                        <button
                          className="btn btn-primary"
                          onClick={() => handleRepayLoan(loan)}
                          disabled={loading || !repayVal || parseFloat(repayVal) <= 0}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          💳 Repay
                        </button>
                      </div>
                      <button
                        className="btn btn-ghost"
                        onClick={() => setRepayAmounts(prev => ({ ...prev, [loan.loan_id]: remaining.toFixed(6) }))}
                        style={{ width: '100%', marginTop: 6, fontSize: 12 }}
                      >
                        Pay Full Remaining ({remaining.toFixed(4)} ALEO)
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Manual fallback */}
            <details style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-4)', userSelect: 'none' }}>⚙️ Manual Repay (paste record)</summary>
              <div style={{ marginTop: 12 }}>
                <div className="field">
                  <label className="field-label">LoanAgreement Record (Plaintext)</label>
                  <textarea className="field-input" rows="4" placeholder='Paste your decrypted LoanAgreement record here...' value={manualRecord} onChange={e => setManualRecord(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 11 }} />
                </div>
                <div className="field">
                  <label className="field-label">Repayment Amount (ALEO)</label>
                  <input className="field-input" type="number" step="0.000001" placeholder="e.g. 10.5" value={manualRepayAmt} onChange={e => setManualRepayAmt(e.target.value)} />
                </div>
                <button className="btn btn-primary" onClick={handleManualRepay} disabled={loading || !manualRecord || !manualRepayAmt} style={{ width: '100%' }}>
                  {loading ? 'Processing...' : '💳 Manual Repay'}
                </button>
              </div>
            </details>
          </div>
        )}

        {/* Step Progress UI (replaces old txState for multi-step flows) */}
        {stepProgress && (
          <StepProgress steps={stepProgress.steps} message={stepProgress.message} status={stepProgress.status} />
        )}

        {/* Simple txState toast for non-step flows (fund, repay, unlock) */}
        {txState && !stepProgress && (
          <div className={`badge badge-${txState.type === 'ok' ? 'success' : txState.type === 'err' ? 'danger' : 'info'}`} style={{ marginTop: 20, width: '100%', whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.5 }}>
            {txState.type === 'pending' && <span className="loader" style={{ marginRight: 8 }}></span>}
            {txState.msg}
          </div>
        )}
      </div>
    </div>
  );
}
