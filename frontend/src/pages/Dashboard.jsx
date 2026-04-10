import React, { useEffect, useState } from 'react';
import CreditGauge from '../components/CreditGauge';
import { fetchMappingValue } from '../services/explorerApi';

export default function Dashboard({ address }) {
  const [creditScore, setCreditScore] = useState(null);
  const [verifiedIncome, setVerifiedIncome] = useState(null);
  const [loanCount, setLoanCount] = useState(null);

  useEffect(() => {
    if (!address) return;
    fetchMappingValue('credaris_credit_v1.aleo', 'credit_scores', address)
      .then(v => { if (v) setCreditScore(parseInt(String(v).replace('u64', ''), 10)); })
      .catch(() => {});
    fetchMappingValue('credaris_income_v2.aleo', 'verified_incomes', address)
      .then(v => { if (v) setVerifiedIncome(parseInt(String(v).replace('u64', ''), 10)); })
      .catch(() => {});
    fetchMappingValue('credaris_lending_v1.aleo', 'loan_count', address)
      .then(v => { if (v) setLoanCount(parseInt(String(v).replace('u64', ''), 10)); })
      .catch(() => {});
  }, [address]);

  if (!address) {
    return (
      <div className="hero">
        <h1>Privacy-Preserving<br /><span>Financial Identity</span></h1>
        <p>Verifiable income proofs, zero-knowledge credit scores, and secure lending — all on Aleo.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <div className="status-badge info"><span className="status-dot"></span> Testnet Live</div>
          <div className="status-badge success"><span className="status-dot"></span> 3 Programs Deployed</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Dashboard</h2>
        <p className="section-desc">Your Credaris financial identity overview</p>
      </div>

      <div className="dashboard-stats">
        <div className="card">
          <div className="card-header">
            <div className="card-icon credit">📈</div>
          </div>
          <div className="stat-label">Credit Score</div>
          <div className="stat-value gradient">{creditScore || '—'}</div>
          <div className="stat-label">{creditScore ? 'On-chain verified' : 'Not computed yet'}</div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-icon income">💰</div>
          </div>
          <div className="stat-label">Verified Income</div>
          <div className="stat-value gradient">
            {verifiedIncome ? `${(verifiedIncome / 1_000_000).toFixed(2)}` : '—'}
          </div>
          <div className="stat-label">{verifiedIncome ? 'credits attested' : 'No attestation yet'}</div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-icon lending">🏦</div>
          </div>
          <div className="stat-label">Active Loans</div>
          <div className="stat-value gradient">{loanCount ?? '—'}</div>
          <div className="stat-label">{loanCount !== null ? 'on-chain loans' : 'No loans yet'}</div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Score Overview</div>
          </div>
          <CreditGauge score={creditScore || 300} />
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Wallet</div>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: 16 }}>
            {address}
          </div>
          <div className="score-breakdown">
            <div className="score-factor">
              <span className="score-factor-label">Network</span>
              <span className="status-badge info">Aleo Testnet</span>
            </div>
            <div className="score-factor">
              <span className="score-factor-label">Income Program</span>
              <span className="status-badge success">credaris_income_v2</span>
            </div>
            <div className="score-factor">
              <span className="score-factor-label">Credit Program</span>
              <span className="status-badge success">credaris_credit_v1</span>
            </div>
            <div className="score-factor">
              <span className="score-factor-label">Lending Program</span>
              <span className="status-badge success">credaris_lending_v1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
