import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight, fetchTransactionsByAddress, fetchAleoPrice, fetchPublicBalance, fetchUsdcxBalance, fetchUsadBalance } from '../services/api';
import { analyzeIncome } from '../services/incomeAnalyzer';

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
      const val = await fetchMappingValue('credaris_core_v2.aleo', 'has_score', address);
      if (val === true || String(val) === 'true') {
        setScore('verified'); // Score is private — we only know it exists
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

      // Verify and resolve IncomeProof Envelope securely mathematically
      let records = null;
      if (typeof requestRecords === 'function') {
         records = await requestRecords('credaris_core_v2.aleo');
      }
      // Wallets often aggressively natively strip `program_id` tags from responses since the query context natively inherently bounds it.
      // We physically trace correctly by grabbing the chronologically newest unspent envelope internally!
      const unspentProofs = records?.filter(r => {
         if (r.recordName !== 'IncomeProof' || r.spent) return false;
         const pid = r.program_id || r.programId;
         return !pid || pid === 'credaris_core_v2.aleo';
      }) || [];
      
      const incomeRecord = unspentProofs.sort((a, b) => (b.blockHeight || b.height || 0) - (a.blockHeight || a.height || 0))[0] || unspentProofs.pop();
      if (!incomeRecord) {
         setTxState({ type: 'err', msg: 'No active IncomeProof record found in wallet! Please execute the native Income Verification suite first.' });
         setComputing(false); 
         return;
      }

      let payloadLiteral = typeof incomeRecord === 'string' ? incomeRecord : (incomeRecord.recordPlaintext || incomeRecord.plaintext);

      // Force strictly unencrypted native Leo syntactic literal representations
      if (!payloadLiteral && typeof requestRecordPlaintexts === 'function') {
         try {
           setTxState({ type: 'pending', msg: 'Requesting Leo Syntax Plaintexts natively from Wallet...' });
           const plaintexts = await requestRecordPlaintexts('credaris_core_v2.aleo');
           const pts = plaintexts?.filter(p => !p.spent && p.recordName === 'IncomeProof');
           if (pts && pts.length > 0) {
              const matched = pts[0];
              payloadLiteral = typeof matched === 'string' ? matched : (matched.recordPlaintext || matched.plaintext);
           }
         } catch (err) {
           console.log('Plaintext hook failed physically:', err);
         }
      }

      // Failsafe fallback checking exact wallet ciphertext wrappers
      if (!payloadLiteral) {
          payloadLiteral = incomeRecord.recordCiphertext || incomeRecord.ciphertext;
      }

      if (!payloadLiteral) {
         setTxState({ type: 'err', msg: 'Extracted payload evaluated NULL natively. Wallet failed generating envelope mappings entirely.' });
         setComputing(false);
         return;
      }
      
      console.log('Native Aleo Execute Payload Input #0:', payloadLiteral);

      // Regex Parse literal variables accurately completely dodging parser anomalies dynamically
      let verifiedIncome = 0;
      let txCount = 0;
      let avgIncome = 0;
      let periodEnd = 0;

      const txt = typeof payloadLiteral === 'object' ? JSON.stringify(payloadLiteral) : payloadLiteral;
      
      const vMatch = txt.match(/total_income:\s*(\d+)u64/);
      verifiedIncome = vMatch ? parseInt(vMatch[1], 10) : (payloadLiteral.total_income || payloadLiteral.totalIncome || parseInt(txt.match(/totalIncome":\s*"?(\d+)"?/) || 0, 10));

      const tMatch = txt.match(/tx_count:\s*(\d+)u64/);
      txCount = tMatch ? parseInt(tMatch[1], 10) : (payloadLiteral.tx_count || payloadLiteral.txCount || parseInt(txt.match(/txCount":\s*"?(\d+)"?/) || 0, 10));

      const aMatch = txt.match(/avg_income:\s*(\d+)u64/);
      avgIncome = aMatch ? parseInt(aMatch[1], 10) : (payloadLiteral.avg_income || payloadLiteral.avgIncome || parseInt(txt.match(/avgIncome":\s*"?(\d+)"?/) || 0, 10));

      const pMatch = txt.match(/period_end:\s*(\d+)u32/);
      periodEnd = pMatch ? parseInt(pMatch[1], 10) : (payloadLiteral.period_end || payloadLiteral.periodEnd || parseInt(txt.match(/periodEnd":\s*"?(\d+)"?/) || 0, 10));

      // Synchronously retrieve exact mapped states mathematically to pass execution asserts
      const rStr = await fetchMappingValue('credaris_core_v2.aleo', 'repayment_count', address) || '0';
      const repayCount = parseInt(rStr.replace(/u\d+$/g, ''), 10) || 0;
      
      const tStr = await fetchMappingValue('credaris_core_v2.aleo', 'total_repaid', address) || '0';
      const totalRepaid = parseInt(tStr.replace(/u\d+$/g, ''), 10) || 0;
      
      const mStr = await fetchMappingValue('credaris_core_v2.aleo', 'missed_payments', address) || '0';
      const missedPayments = parseInt(mStr.replace(/u\d+$/g, ''), 10) || 0;

      // Update mapping parameters purely off explicit ZK bounding states mapping correctly natively!
      setBreakdown({ verifiedIncome, incomeTxCount: txCount, avgIncome, periodEnd, repayCount, totalRepaid, missedPayments });

      setTxState({ type: 'pending', msg: 'Submitting ZK compute_score primitive mapping bounds to credaris_core_v2.aleo...' });

      const result = await executeTransaction({
        program: 'credaris_core_v2.aleo',
        function: 'compute_score',
        inputs: [
          `${verifiedIncome}u64`,
          `${txCount}u64`,
          `${avgIncome}u64`,
          `${periodEnd}u32`,
          `${repayCount}u64`,
          `${totalRepaid}u64`,
          `${missedPayments}u64`,
          `${currentBlock}u32`,
        ],
        fee: 500000,
        privateFee: false,
      });

      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting: ${result.transactionId}` });
        pollRef.current = setInterval(async () => {
          try {
            const res = await transactionStatus(result.transactionId);
            if (res && res.status && res.status.toLowerCase() !== 'pending') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              if (res.status.toLowerCase() === 'accepted') {
                setTxState({ type: 'ok', msg: `Score computed! TX: ${result.transactionId}` });
                setScore('verified');
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
        let allWalletRecords = await requestRecords('credaris_core_v2.aleo');
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
        const plaintexts = await requestRecordPlaintexts('credaris_credit_v4.aleo');
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

      setTxState({ type: 'err', msg: 'Could not decrypt records. Your wallet may not support record decryption natively. Check browser console for details.' });
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
              <div className="card-sub">Execute credaris_core_v2.aleo::compute_score</div>
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
