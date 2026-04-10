import React, { useState } from 'react';
import CreditGauge from '../components/CreditGauge';
import { computeCreditScore } from '../services/aleoProgram';
import { fetchMappingValue } from '../services/explorerApi';

export default function CreditScorePanel({ wallet, address }) {
  const [score, setScore] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [inputs, setInputs] = useState({
    verifiedIncome: '',
    incomeTxCount: '',
    avgIncome: '',
    repaymentCount: '0',
    totalRepaid: '0',
    missedPayments: '0',
  });

  const handleFetchScore = async () => {
    if (!address) return;
    try {
      const val = await fetchMappingValue('credaris_credit_v1.aleo', 'credit_scores', address);
      if (val) setScore(parseInt(String(val).replace('u64', ''), 10));
    } catch (e) { /* no score yet */ }
  };

  const handleCompute = async () => {
    if (!wallet || !address) return;
    setLoading(true);
    setTxStatus({ status: 'pending', message: 'Computing ZK credit score...' });

    try {
      const txId = await computeCreditScore(wallet, {
        recipient: address,
        verifiedIncome: parseInt(inputs.verifiedIncome) || 0,
        incomeTxCount: parseInt(inputs.incomeTxCount) || 0,
        avgIncome: parseInt(inputs.avgIncome) || 0,
        repaymentCount: parseInt(inputs.repaymentCount) || 0,
        totalRepaid: parseInt(inputs.totalRepaid) || 0,
        missedPayments: parseInt(inputs.missedPayments) || 0,
        currentBlock: 0,
      });

      setTxStatus({ status: 'confirmed', message: `Transaction: ${txId}` });

      // Simulate local score calculation for preview
      const freq = Math.min(parseInt(inputs.incomeTxCount || 0) * 5, 200);
      const avg = parseInt(inputs.avgIncome || 0);
      const amtComp = avg >= 10000000 ? 100 : avg >= 5000000 ? 75 : avg >= 1000000 ? 50 : avg >= 100000 ? 25 : 10;
      const incomeFactor = freq + amtComp;
      const repayFactor = Math.min(parseInt(inputs.repaymentCount || 0) * 15, 200);
      const pen = parseInt(inputs.missedPayments || 0) * 50;
      const raw = 300 + incomeFactor + repayFactor;
      const s = Math.min(850, Math.max(300, raw > pen ? raw - pen : 300));

      setScore(s);
      setBreakdown({ incomeFactor, repayFactor, penalty: pen });
    } catch (err) {
      setTxStatus({ status: 'failed', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (!address) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">🔗</div>
          <p>Connect your wallet to compute credit score</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Credit Score</h2>
        <p className="section-desc">Compute your ZK credit score from verified income and repayment history</p>
      </div>

      <div className="panel-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Your Score</div>
              <div className="card-subtitle">Privacy-preserving credit rating</div>
            </div>
            <div className="card-icon credit">📈</div>
          </div>

          <CreditGauge score={score || 300} />

          <button className="btn btn-secondary btn-sm" onClick={handleFetchScore} style={{ width: '100%' }}>
            🔄 Fetch from Chain
          </button>

          {breakdown && (
            <div className="score-breakdown">
              <div className="score-factor">
                <span className="score-factor-label">Income Factor</span>
                <span className="score-factor-value" style={{ color: 'var(--success)' }}>+{breakdown.incomeFactor}</span>
              </div>
              <div className="score-bar">
                <div className="score-bar-fill" style={{ width: `${(breakdown.incomeFactor / 300) * 100}%` }}></div>
              </div>
              <div className="score-factor">
                <span className="score-factor-label">Repayment Factor</span>
                <span className="score-factor-value" style={{ color: 'var(--accent-light)' }}>+{breakdown.repayFactor}</span>
              </div>
              <div className="score-bar">
                <div className="score-bar-fill" style={{ width: `${(breakdown.repayFactor / 200) * 100}%` }}></div>
              </div>
              <div className="score-factor">
                <span className="score-factor-label">Penalty</span>
                <span className="score-factor-value" style={{ color: 'var(--danger)' }}>-{breakdown.penalty}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Compute Score</div>
              <div className="card-subtitle">Provide verified data inputs</div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Verified Income (microcredits)</label>
            <input className="form-input" type="number" placeholder="e.g. 5000000"
              value={inputs.verifiedIncome} onChange={e => setInputs({ ...inputs, verifiedIncome: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Income TX Count</label>
            <input className="form-input" type="number" placeholder="e.g. 10"
              value={inputs.incomeTxCount} onChange={e => setInputs({ ...inputs, incomeTxCount: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Avg Income (microcredits)</label>
            <input className="form-input" type="number" placeholder="e.g. 500000"
              value={inputs.avgIncome} onChange={e => setInputs({ ...inputs, avgIncome: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Repayment Count</label>
            <input className="form-input" type="number" placeholder="0"
              value={inputs.repaymentCount} onChange={e => setInputs({ ...inputs, repaymentCount: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Total Repaid (microcredits)</label>
            <input className="form-input" type="number" placeholder="0"
              value={inputs.totalRepaid} onChange={e => setInputs({ ...inputs, totalRepaid: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Missed Payments</label>
            <input className="form-input" type="number" placeholder="0"
              value={inputs.missedPayments} onChange={e => setInputs({ ...inputs, missedPayments: e.target.value })} />
          </div>

          <button className="btn btn-primary" onClick={handleCompute} disabled={loading} style={{ width: '100%' }}>
            {loading ? <><span className="spinner"></span> Computing...</> : '⚡ Compute ZK Score'}
          </button>

          {txStatus && (
            <div className={`tx-status ${txStatus.status}`}>
              {txStatus.status === 'pending' && <span className="spinner"></span>}
              {txStatus.status === 'confirmed' && <span>✅</span>}
              {txStatus.status === 'failed' && <span>❌</span>}
              <span style={{ fontSize: 13 }}>{txStatus.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
