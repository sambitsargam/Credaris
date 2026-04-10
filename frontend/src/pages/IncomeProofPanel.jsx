import React, { useState } from 'react';
import { fetchTransactionsByAddress } from '../services/explorerApi';
import { analyzeIncome } from '../services/incomeAnalyzer';
import { attestIncome } from '../services/aleoProgram';

export default function IncomeProofPanel({ wallet, address }) {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [incomeData, setIncomeData] = useState(null);
  const [txStatus, setTxStatus] = useState(null);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    if (!address) return;
    setAnalyzing(true);
    setError(null);
    try {
      const txs = await fetchTransactionsByAddress(address);
      const data = analyzeIncome(txs, address);
      setIncomeData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAttest = async () => {
    if (!wallet || !incomeData || incomeData.txCount === 0) return;
    setLoading(true);
    setTxStatus({ status: 'pending', message: 'Generating ZK proof...' });
    try {
      const txId = await attestIncome(wallet, {
        totalIncome: incomeData.totalIncome,
        txCount: incomeData.txCount,
        avgIncome: incomeData.avgIncome,
        periodStart: incomeData.periodStart,
        periodEnd: incomeData.periodEnd,
        recipient: address,
      });
      setTxStatus({ status: 'confirmed', message: `Transaction: ${txId}` });
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
          <p>Connect your wallet to analyze income</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Income Proof</h2>
        <p className="section-desc">Analyze on-chain transactions and generate a verifiable income attestation</p>
      </div>

      <div className="panel-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Transaction Analysis</div>
              <div className="card-subtitle">Scans credits.aleo transfers from Provable Explorer</div>
            </div>
            <div className="card-icon income">📊</div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? <><span className="spinner"></span> Analyzing...</> : '🔍 Analyze Income'}
          </button>

          {error && (
            <div className="tx-status failed" style={{ marginTop: 16 }}>
              <span>❌</span> {error}
            </div>
          )}

          {incomeData && (
            <div style={{ marginTop: 20 }}>
              <div className="score-breakdown">
                <div className="score-factor">
                  <span className="score-factor-label">Total Income</span>
                  <span className="score-factor-value">{(incomeData.totalIncome / 1_000_000).toFixed(2)} credits</span>
                </div>
                <div className="score-factor">
                  <span className="score-factor-label">Transactions</span>
                  <span className="score-factor-value">{incomeData.txCount}</span>
                </div>
                <div className="score-factor">
                  <span className="score-factor-label">Avg Income</span>
                  <span className="score-factor-value">{(incomeData.avgIncome / 1_000_000).toFixed(2)} credits</span>
                </div>
                <div className="score-factor">
                  <span className="score-factor-label">Period</span>
                  <span className="score-factor-value">Block {incomeData.periodStart} → {incomeData.periodEnd}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Generate Proof</div>
              <div className="card-subtitle">Create a ZK income attestation on Aleo</div>
            </div>
            <div className="card-icon income">🛡️</div>
          </div>

          {incomeData && incomeData.txCount > 0 ? (
            <>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Ready to attest {(incomeData.totalIncome / 1_000_000).toFixed(2)} credits across {incomeData.txCount} transactions.
              </p>
              <button
                className="btn btn-primary"
                onClick={handleAttest}
                disabled={loading}
              >
                {loading ? <><span className="spinner"></span> Generating...</> : '⚡ Generate ZK Proof'}
              </button>
            </>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              Run the analysis first to generate a proof.
            </p>
          )}

          {txStatus && (
            <div className={`tx-status ${txStatus.status}`}>
              {txStatus.status === 'pending' && <span className="spinner"></span>}
              {txStatus.status === 'confirmed' && <span>✅</span>}
              {txStatus.status === 'failed' && <span>❌</span>}
              <span style={{ fontSize: 13 }}>{txStatus.message}</span>
            </div>
          )}
        </div>

        {incomeData && incomeData.transfers.length > 0 && (
          <div className="card panel-full">
            <div className="card-title" style={{ marginBottom: 16 }}>Transaction History</div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Amount</th>
                    <th>Block</th>
                    <th>Function</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeData.transfers.slice(0, 20).map((t, i) => (
                    <tr key={i}>
                      <td><span className="tx-hash">{t.txId.slice(0, 16)}...</span></td>
                      <td>{(t.amount / 1_000_000).toFixed(4)} credits</td>
                      <td>{t.blockHeight}</td>
                      <td><span className="status-badge info">{t.function}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
