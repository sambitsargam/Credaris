import React, { useEffect, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight, fetchPublicBalance, fetchAleoPrice } from '../services/api';

const CONTRACTS = {
  income: 'credaris_income_v1.aleo',
  credit: 'credaris_credit_v1.aleo',
  lending: 'credaris_lending_v1.aleo',
};

const EXPLORER_BASE = 'https://testnet.explorer.provable.com/program/';

export default function DashboardPage() {
  const { address, connected } = useWallet();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connected || !address) return;
    setLoading(true);
    (async () => {
      try {
        const [balance, aleoPrice, income, score, loanCount, repaidTotal, blockHeight] = await Promise.all([
          fetchPublicBalance(address),
          fetchAleoPrice(),
          fetchMappingValue(CONTRACTS.income, 'verified_incomes', address),
          fetchMappingValue(CONTRACTS.credit, 'credit_scores', address),
          fetchMappingValue(CONTRACTS.lending, 'loan_count', address),
          fetchMappingValue(CONTRACTS.lending, 'total_repaid', address),
          fetchBlockHeight(),
        ]);
        setData({
          aleoBalance: balance || 0,
          aleoPrice: aleoPrice || 0,
          verifiedIncome: income ? parseInt(String(income).replace(/u\d+$/g, ''), 10) : 0,
          creditScore: score ? parseInt(String(score).replace(/u\d+$/g, ''), 10) : 0,
          activeLoans: loanCount ? parseInt(String(loanCount).replace(/u\d+$/g, ''), 10) : 0,
          totalRepaid: repaidTotal ? parseInt(String(repaidTotal).replace(/u\d+$/g, ''), 10) : 0,
          blockHeight: typeof blockHeight === 'number' ? blockHeight : parseInt(blockHeight, 10),
        });
      } catch (e) {
        console.error('Dashboard fetch error:', e);
        setData({ aleoBalance: 0, aleoPrice: 0, verifiedIncome: 0, creditScore: 0, activeLoans: 0, totalRepaid: 0, blockHeight: 0 });
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

  const aleoBal = data ? (data.aleoBalance / 1_000_000) : 0;
  const aleoUsd = data && data.aleoPrice > 0 ? (aleoBal * data.aleoPrice) : 0;

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-desc">
          {address ? `${address.slice(0, 12)}…${address.slice(-6)}` : ''} · Block #{data?.blockHeight?.toLocaleString() || '—'}
          {data?.aleoPrice > 0 && <> · ALEO ≈ ${data.aleoPrice.toFixed(2)}</>}
        </p>
      </div>

      {loading ? (
        <div className="card"><div className="empty"><span className="spin"></span><p style={{ marginTop: 16 }}>Loading on-chain data...</p></div></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-head">
              <div className="card-title">Wallet Balances</div>
              <div className="badge badge-info">Live On-Chain</div>
            </div>
            <div className="token-grid">
              <div className="token-card active" style={{ '--token-color': '#e8613c' }}>
                <div className="token-card-symbol">ALEO</div>
                <div className="token-card-name">Aleo Credits</div>
                <div className="token-card-desc">Native gas & lending token</div>
                <div className="token-card-balance">{aleoBal.toFixed(4)}</div>
                {aleoUsd > 0 && <div className="token-card-usd">≈ ${aleoUsd.toFixed(2)}</div>}
              </div>
              <div className="token-card" style={{ '--token-color': '#2775ca' }}>
                <div className="token-card-symbol">USDCx</div>
                <div className="token-card-name">USD Coin (Aleo)</div>
                <div className="token-card-desc">Synthetic stablecoin</div>
                <div className="token-card-balance">
                  {aleoBal > 0 && aleoUsd > 0
                    ? `$${aleoUsd.toFixed(2)}`
                    : '—'}
                </div>
                <div className="token-card-usd">ALEO equivalent</div>
              </div>
              <div className="token-card" style={{ '--token-color': '#10b981' }}>
                <div className="token-card-symbol">USAD</div>
                <div className="token-card-name">Aleo Dollar</div>
                <div className="token-card-desc">Algorithmic stablecoin</div>
                <div className="token-card-balance">
                  {aleoBal > 0 && aleoUsd > 0
                    ? `$${aleoUsd.toFixed(2)}`
                    : '—'}
                </div>
                <div className="token-card-usd">ALEO equivalent</div>
              </div>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-label">Verified Income</div>
              <div className="stat-val">
                {data?.verifiedIncome ? `${(data.verifiedIncome / 1_000_000).toFixed(2)}` : '0.00'}
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>ALEO</span>
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
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>ALEO</span>
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
                    <a href={`${EXPLORER_BASE}${id}`} target="_blank" rel="noopener noreferrer"
                       className="badge badge-info" style={{ cursor: 'pointer' }}>
                      {id} ↗
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
