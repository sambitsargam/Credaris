import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';

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
  const { address, connected, executeTransaction, transactionStatus } = useWallet();
  const [computing, setComputing] = useState(false);
  const [score, setScore] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [txState, setTxState] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (!connected || !address) return;
    (async () => {
      const val = await fetchMappingValue('credaris_credit_v1.aleo', 'credit_scores', address);
      if (val) {
        const s = parseInt(String(val).replace('u64', ''), 10);
        if (s > 0) setScore(s);
      }
    })();
  }, [address, connected]);

  const handleCompute = async () => {
    if (!connected || !address) return;
    setComputing(true);
    setTxState({ type: 'pending', msg: 'Fetching on-chain data for score computation...' });

    try {
      const [incomeRaw, repaidRaw, repayCountRaw, blockHeight] = await Promise.all([
        fetchMappingValue('credaris_income_v2.aleo', 'verified_incomes', address),
        fetchMappingValue('credaris_lending_v1.aleo', 'total_repaid', address),
        fetchMappingValue('credaris_lending_v1.aleo', 'repayment_count', address),
        fetchBlockHeight(),
      ]);

      const verifiedIncome = incomeRaw ? parseInt(String(incomeRaw).replace('u64', ''), 10) : 0;
      const totalRepaid = repaidRaw ? parseInt(String(repaidRaw).replace('u64', ''), 10) : 0;
      const repayCount = repayCountRaw ? parseInt(String(repayCountRaw).replace('u64', ''), 10) : 0;

      const incomeTxCount = verifiedIncome > 0 ? 5 : 1;
      const avgIncome = verifiedIncome > 0 ? Math.floor(verifiedIncome / incomeTxCount) : 0;
      const currentBlock = typeof blockHeight === 'number' ? blockHeight : parseInt(blockHeight, 10);

      setBreakdown({ verifiedIncome, incomeTxCount, avgIncome, repayCount, totalRepaid, missedPayments: 0 });

      setTxState({ type: 'pending', msg: 'Submitting score computation to credaris_credit_v1.aleo...' });

      const result = await executeTransaction({
        program: 'credaris_credit_v1.aleo',
        function: 'compute_score',
        inputs: [
          address,
          `${verifiedIncome}u64`,
          `${incomeTxCount}u64`,
          `${avgIncome}u64`,
          `${repayCount}u64`,
          `${totalRepaid}u64`,
          `0u64`,
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
                const updated = await fetchMappingValue('credaris_credit_v1.aleo', 'credit_scores', address);
                if (updated) setScore(parseInt(String(updated).replace('u64', ''), 10));
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
              <div className="card-sub">Range: 300 (Poor) — 850 (Excellent)</div>
            </div>
            {score && <span className="badge badge-ok">On-Chain</span>}
          </div>
          {score ? <ScoreGauge score={score} /> : (
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
              <div className="card-sub">Execute credaris_credit_v1.aleo::compute_score</div>
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
