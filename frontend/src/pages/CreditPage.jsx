import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';
import { useIncomeSnapshot } from '../context/IncomeContext';


function ScoreGauge({ score }) {
  const pct = Math.max(0, Math.min(1, (score - 300) / 550));
  const r = 80, cx = 100, cy = 100;
  const start = Math.PI, sweep = Math.PI;
  const circ = sweep * r;
  const offset = circ * (1 - pct);
  const color = score >= 700 ? 'var(--emerald)' : score >= 500 ? 'var(--amber)' : 'var(--rose)';
  const rating = score >= 750 ? 'Excellent' : score >= 700 ? 'Good' : score >= 600 ? 'Fair' : score >= 400 ? 'Poor' : 'Very Poor';

  return (
    <div className="gauge-wrap">
      <svg className="gauge-svg" viewBox="0 0 200 120">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} className="gauge-track" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} className="gauge-bar"
          stroke={color} strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="gauge-num" style={{ color }}>{score}</div>
      <div className="gauge-lbl" style={{ color }}>{rating}</div>
      <div className="gauge-range"><span>300</span><span>575</span><span>850</span></div>
    </div>
  );
}

export default function CreditPage() {
  const { wallet, address, connected, executeTransaction, transactionStatus, requestRecords, requestRecordPlaintexts } = useWallet();
  const { snapshot } = useIncomeSnapshot();

  const [computing, setComputing] = useState(false);
  const [score, setScore] = useState(null);
  const [decryptedScore, setDecryptedScore] = useState(null);
  const [decrypting, setDecrypting] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [txState, setTxState] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (!connected || !address) return;
    (async () => {
      const val = await fetchMappingValue('core_credaris.aleo', 'has_score', address);
      if (val === true || String(val) === 'true') {
        setScore('verified'); // Score exists on-chain — details stay private until user decrypts
      }
    })();
  }, [address, connected]);

  const handleCompute = async () => {
    if (!connected || !address) return;
    setComputing(true);
    setTxState({ type: 'pending', msg: 'Fetching IncomeProof constraint envelopes...' });

    try {
      const blockHeightRes = await fetchBlockHeight();
      const currentBlock = typeof blockHeightRes === 'number' ? blockHeightRes : parseInt(blockHeightRes, 10);

      let snapRaw = snapshot;
      
      // RECOVERY LOGIC: Scan wallet if context is lost
      if (!snapRaw) {
        setTxState({ type: 'pending', msg: '🔍 No session data. Scanning wallet for IncomeProof records...' });
        try {
          const plaintexts = await requestRecordPlaintexts('core_credaris.aleo');
          const incomeRecs = plaintexts.filter(pt => {
            const str = typeof pt === 'string' ? pt : JSON.stringify(pt);
            return str.includes('IncomeProof') || (str.includes('total_income') && str.includes('tx_count'));
          });

          if (incomeRecs.length > 0) {
            // Sort by period_end or just take newest for now
            const newest = incomeRecs[incomeRecs.length - 1]; 
            const pt = typeof newest === 'string' ? newest : JSON.stringify(newest);
            
            // Regex parse values
            const incomeMatch = pt.match(/total_income:\s*([0-9]+)u64/);
            const txMatch = pt.match(/tx_count:\s*([0-9]+)u64/);
            const avgMatch = pt.match(/avg_income:\s*([0-9]+)u64/);
            const endMatch = pt.match(/period_end:\s*([0-9]+)u32/);

            if (incomeMatch && txMatch && avgMatch) {
              snapRaw = {
                verifiedIncome: parseInt(incomeMatch[1]),
                txCount: parseInt(txMatch[1]),
                avgIncome: parseInt(avgMatch[1]),
                periodEnd: endMatch ? parseInt(endMatch[1]) : 0
              };
              console.log('Recovered attestation from wallet:', snapRaw);
            }
          }
        } catch (e) {
          console.warn('Wallet scan failed:', e);
        }
      }

      if (!snapRaw) {
        setTxState({ type: 'err', msg: '❌ No attestation found. Please go to the Income page and submit an attestation first.' });
        setComputing(false);
        return;
      }

      const verifiedIncome = snapRaw.verifiedIncome;
      const txCount        = snapRaw.txCount;
      const avgIncome      = snapRaw.avgIncome;
      const periodEnd      = snapRaw.periodEnd || 0;

      // Retrieve exact on-chain mapped states to satisfy finalize asserts
      const rStr = await fetchMappingValue('core_credaris.aleo', 'repayment_count', address) || '0';
      const repayCount = parseInt(rStr.replace(/u\d+$/g, ''), 10) || 0;

      const tStr = await fetchMappingValue('core_credaris.aleo', 'total_repaid', address) || '0';
      const totalRepaid = parseInt(tStr.replace(/u\d+$/g, ''), 10) || 0;

      const mStr = await fetchMappingValue('core_credaris.aleo', 'missed_payments', address) || '0';
      const missedPayments = parseInt(mStr.replace(/u\d+$/g, ''), 10) || 0;

      setBreakdown({ verifiedIncome, incomeTxCount: txCount, avgIncome, periodEnd, repayCount, totalRepaid, missedPayments });
      setTxState({ type: 'pending', msg: 'Submitting ZK compute_score to core_credaris.aleo...' });


      const result = await executeTransaction({
        program: 'core_credaris.aleo',
        function: 'compute_score',
        inputs: [
          address,
          `${verifiedIncome}u64`,
          `${txCount}u64`,
          `${avgIncome}u64`,
          `${repayCount}u64`,
          `${missedPayments}u64`,
          `${currentBlock}u32`,
        ],
        fee: 500000,
        privateFee: false,
      });

      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting credit score computation...` });
        pollRef.current = setInterval(async () => {
          try {
            const res = await transactionStatus(result.transactionId);
            if (res && res.status && res.status.toLowerCase() !== 'pending') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              if (res.status.toLowerCase() === 'accepted') {
                // Extract real TX ID (at1...) from status response
                const realTxId = [res?.transactionId, res?.transaction_id, res?.txId, res?.tx_id, res?.id]
                  .find(c => c && typeof c === 'string' && c.startsWith('at1')) || result.transactionId;
                setScore('verified');
                setTxState({ type: 'ok', msg: `✅ Score computed on-chain! TX: ${realTxId}` });
              } else {
                setTxState({ type: 'err', msg: `Failed: ${res.error || res.status}` });
              }
              setComputing(false);
            }
          } catch (e) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setTxState({ type: 'err', msg: e.message });
            setComputing(false);
          }
        }, 3000);
      }
    } catch (err) {
      setTxState({ type: 'err', msg: err.message });
      setComputing(false);
    }
  };

  const handleDecrypt = async () => {
    setDecrypting(true);
    setTxState({ type: 'pending', msg: 'Requesting wallet to decrypt CreditReport records...' });
    try {
      // Parse score fields from a plaintext string like:
      // "{ owner: aleo1..., score: 410u64.private, income_factor: 110u64.private, ... }"
      const parseScore = (text) => {
        const get = (key) => {
          const re = new RegExp(key + '\\s*:\\s*(\\d+)');
          const m = text.match(re);
          return m ? parseInt(m[1], 10) : null;
        };
        const score = get('score');
        if (score === null || score === 0) return null;
        return {
          score,
          incomeFactor: get('income_factor') || 0,
          repayFactor: get('repayment_factor') || 0,
          penalty: get('penalty') || 0,
          computedAt: get('computed_at') || 0,
        };
      };

      let allParsed = [];

      // Approach 1: Use requestRecords + decrypt the ciphertext
      if (requestRecords) {
        let allWalletRecords = await requestRecords('core_credaris.aleo');
        console.log('Records from wallet envelopes:', allWalletRecords);

        // Filter explicitly to CreditReports since core_v1 maps Collateral and IncomeProofs too!
        let records = allWalletRecords?.filter(r => r.recordName === 'CreditReport' && !r.spent);

        if (records && records.length > 0) {
          // Pre-sort envelope objects explicitly by unencrypted block values natively
          records.sort((a, b) => (b.blockHeight || b.height || 0) - (a.blockHeight || a.height || 0));

          for (const rec of records) {
            let plaintextFound = false;

            // Maybe the record already has plaintext data natively loaded
            const textSources = [rec.plaintext, rec.recordPlaintext, rec.data, JSON.stringify(rec)];
            for (const src of textSources) {
              if (!src) continue;
              const text = typeof src === 'string' ? src : JSON.stringify(src);
              if (text.includes('score')) {
                const parsed = parseScore(text);
                if (parsed) {
                  allParsed.push(parsed);
                  plaintextFound = true;
                  break;
                }
              }
            }

            // If not found, explicitly prompt singular wallet decrypt hook
            if (!plaintextFound) {
              const ciphertext = rec.recordCiphertext || rec.ciphertext;
              if (ciphertext) {
                let plaintext = null;
                if (typeof decrypt === 'function') {
                  try { plaintext = await decrypt(ciphertext); } catch (e) { console.log('decrypt hook failed:', e); }
                } 
                if (!plaintext && typeof wallet?.decrypt === 'function') {
                  try { plaintext = await wallet.decrypt(ciphertext); } catch (e) { console.log('wallet.decrypt failed:', e); }
                }
                if (!plaintext && typeof wallet?.adapter?.decrypt === 'function') {
                  try { plaintext = await wallet.adapter.decrypt(ciphertext); } catch (e) { console.log('wallet.adapter.decrypt failed:', e); }
                }
                
                if (plaintext) {
                  console.log('Decrypted Target Text:', plaintext);
                  const parsed = parseScore(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));
                  if (parsed) allParsed.push(parsed);
                }
              }
            }

            // Immediately break iteration upon first valid extraction to prevent popup spam
            if (allParsed.length > 0) break;
          }
        }
      }

      // Approach 2: Try requestRecordPlaintexts if available
      if (requestRecordPlaintexts && allParsed.length === 0) {
        const plaintexts = await requestRecordPlaintexts('core_credaris.aleo');
        console.log('Plaintexts:', plaintexts);
        if (plaintexts && plaintexts.length > 0) {
          for (const pt of plaintexts) {
            const text = typeof pt === 'string' ? pt : JSON.stringify(pt);
            const parsed = parseScore(text);
            if (parsed) allParsed.push(parsed);
          }
        }
      }

      if (allParsed.length > 0) {
        // Sort explicitly by computedAt to extract the newest mapped score
        allParsed.sort((a, b) => b.computedAt - a.computedAt);
        const newest = allParsed[0];
        setDecryptedScore(newest);
        setTxState({ type: 'ok', msg: `Decrypted newest! Score: ${newest.score} / 850` });
        return;
      }

      setTxState({ type: 'info', msg: '⏳ Score data may take ~10 seconds to appear on-chain after compute_score. If you just computed, wait a moment and try "View On-Chain Score" below instead.' });
    } catch (err) {
      console.error('Decrypt error:', err);
      setTxState({ type: 'err', msg: `Decrypt failed: ${err.message}` });
    } finally {
      setDecrypting(false);
    }
  };
  if (!connected) {
    return (
      <div className="app-layout">
        <div className="card"><div className="empty"><div className="empty-icon">🔗</div><p>Connect your wallet to compute your credit score</p></div></div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">ZK Credit Score</h1>
        <p className="page-desc">Compute a privacy-preserving credit score from on-chain data</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Your Score</div>
              <div className="card-sub">Privacy-preserving • Score in private record</div>
            </div>
            {score && <span className="badge badge-ok">On-Chain ✅</span>}
          </div>
          {score && !decryptedScore ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: 'var(--emerald)', marginBottom: 8 }}>🔐</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--emerald)' }}>Score Verified</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
                Your credit score is stored in a <strong>private CreditReport record</strong>.<br />
                Decrypt it to view your exact score and breakdown.
              </div>
              <button
                className="btn btn-primary"
                onClick={handleDecrypt}
                disabled={decrypting}
                style={{ marginTop: 20, minWidth: 220 }}
              >
                {decrypting ? <><span className="spin"></span>Decrypting...</> : '🔓 Decrypt & View Score'}
              </button>
            </div>
          ) : decryptedScore ? (
            <div>
              <ScoreGauge score={decryptedScore.score} />
              <div className="rows" style={{ marginTop: 16 }}>
                <div className="row">
                  <span className="row-label">Income Factor</span>
                  <span className="row-val mono">+{decryptedScore.incomeFactor}</span>
                </div>
                <div className="row">
                  <span className="row-label">Repayment Factor</span>
                  <span className="row-val mono">+{decryptedScore.repayFactor}</span>
                </div>
                <div className="row">
                  <span className="row-label">Penalty</span>
                  <span className="row-val mono" style={{ color: decryptedScore.penalty > 0 ? 'var(--rose)' : 'var(--text-3)' }}>
                    -{decryptedScore.penalty}
                  </span>
                </div>
                <div className="row">
                  <span className="row-label">Base Score</span>
                  <span className="row-val mono">300</span>
                </div>
                <div className="row" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4 }}>
                  <span className="row-label" style={{ fontWeight: 600 }}>Final Score</span>
                  <span className="row-val mono" style={{
                    fontWeight: 700,
                    color: decryptedScore.score >= 700 ? 'var(--emerald)' : decryptedScore.score >= 500 ? 'var(--amber)' : 'var(--rose)'
                  }}>
                    {decryptedScore.score} / 850
                  </span>
                </div>
                {decryptedScore.computedAt > 0 && (
                  <div className="row">
                    <span className="row-label">Computed at Block</span>
                    <span className="row-val mono">#{decryptedScore.computedAt.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon">📊</div>
              <p>No score computed yet</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Compute Score</div>
              <div className="card-sub">Execute core_credaris.aleo::compute_score</div>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleCompute} disabled={computing} style={{ width: '100%' }}>
            {computing ? <><span className="spin"></span>Computing...</> : '🧮 Compute Credit Score'}
          </button>

          {breakdown && (
            <div className="rows" style={{ marginTop: 20 }}>
              <div className="row">
                <span className="row-label">Verified Income</span>
                <span className="row-val mono">{breakdown.verifiedIncome}u64</span>
              </div>
              <div className="row">
                <span className="row-label">Income TX Count</span>
                <span className="row-val mono">{breakdown.incomeTxCount}u64</span>
              </div>
              <div className="row">
                <span className="row-label">Avg Income</span>
                <span className="row-val mono">{breakdown.avgIncome}u64</span>
              </div>
              <div className="row">
                <span className="row-label">Repayments</span>
                <span className="row-val mono">{breakdown.repayCount}u64</span>
              </div>
              <div className="row">
                <span className="row-label">Total Repaid</span>
                <span className="row-val mono">{breakdown.totalRepaid}u64</span>
              </div>
              <div className="row">
                <span className="row-label">Missed Payments</span>
                <span className="row-val mono">{breakdown.missedPayments}u64</span>
              </div>
            </div>
          )}

          {txState && (
            <div className={`tx-toast ${txState.type}`}>
              {txState.type === 'pending' && <span className="spin"></span>}
              {txState.type === 'ok' && '✅'}
              {txState.type === 'err' && '❌'}
              <span>{txState.msg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
