import React, { useEffect, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight } from '../services/api';

const CONTRACTS = {
  income: 'credaris_income_v1.aleo',
  credit: 'credaris_credit_v1.aleo',
  lending: 'credaris_lending_v1.aleo',
};

export default function DashboardPage() {
  const { address, connected } = useWallet();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connected || !address) return;
    setLoading(true);
    (async () => {
      try {
        const [income, score, loanCount, repaidTotal, blockHeight] = await Promise.all([
          fetchMappingValue(CONTRACTS.income, 'verified_incomes', address),
          fetchMappingValue(CONTRACTS.credit, 'credit_scores', address),
          fetchMappingValue(CONTRACTS.lending, 'loan_count', address),
          fetchMappingValue(CONTRACTS.lending, 'total_repaid', address),
          fetchBlockHeight(),
        ]);
        setData({
          verifiedIncome: income ? parseInt(String(income).replace('u64', ''), 10) : 0,
          creditScore: score ? parseInt(String(score).replace('u64', ''), 10) : 0,
          activeLoans: loanCount ? parseInt(String(loanCount).replace('u64', ''), 10) : 0,
          totalRepaid: repaidTotal ? parseInt(String(repaidTotal).replace('u64', ''), 10) : 0,
          blockHeight: typeof blockHeight === 'number' ? blockHeight : parseInt(blockHeight, 10),
        });
      } catch (e) {
        console.error('Dashboard fetch error:', e);
        setData({ verifiedIncome: 0, creditScore: 0, activeLoans: 0, totalRepaid: 0, blockHeight: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, [address, connected]);

  if (!connected) {
    return (
      <div className="app-layout">
        <div className="card"><div className="empty"><div className="empty-icon">🔗</div><p>Connect your wallet to view dashboard</p></div></div>
      </div>
    );
  }

  const scoreColor = !data ? 'var(--text-3)' :
    data.creditScore >= 700 ? 'var(--emerald)' :
    data.creditScore >= 500 ? 'var(--amber)' : 'var(--rose)';

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-desc">
          {address ? `${address.slice(0, 12)}…${address.slice(-6)}` : ''} · Block #{data?.blockHeight?.toLocaleString() || '—'}
        </p>
      </div>

      {loading ? (
        <div className="card"><div className="empty"><span className="spin"></span><p style={{ marginTop: 16 }}>Loading on-chain data...</p></div></div>
      ) : (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-label">Verified Income</div>
              <div className="stat-val">
                {data?.verifiedIncome ? `${(data.verifiedIncome / 1_000_000).toFixed(2)}` : '0.00'}
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>credits</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📊</div>
              <div className="stat-label">Credit Score</div>
              <div className="stat-val" style={{ color: scoreColor }}>
                {data?.creditScore || '—'}
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>/ 850</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📄</div>
              <div className="stat-label">Active Loans</div>
              <div className="stat-val">{data?.activeLoans || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-label">Total Repaid</div>
              <div className="stat-val">
                {data?.totalRepaid ? `${(data.totalRepaid / 1_000_000).toFixed(2)}` : '0.00'}
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>credits</span>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head"><div className="card-title">Deployed Programs</div></div>
              <div className="rows">
                {Object.entries(CONTRACTS).map(([key, id]) => (
                  <div className="row" key={key}>
                    <span className="row-label">{key}</span>
                    <a href={`https://explorer.provable.com/programs/${id}`} target="_blank" rel="noopener noreferrer"
                       className="badge badge-info" style={{ cursor: 'pointer' }}>
                      {id}
                    </a>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><div className="card-title">Quick Actions</div></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <a href="/income" className="btn btn-primary" style={{ justifyContent: 'center' }}>Verify Income →</a>
                <a href="/credit" className="btn btn-ghost" style={{ justifyContent: 'center' }}>Compute Credit Score →</a>
                <a href="/lending" className="btn btn-ghost" style={{ justifyContent: 'center' }}>Manage Loans →</a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
