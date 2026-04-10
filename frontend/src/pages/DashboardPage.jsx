import React, { useEffect, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchMappingValue, fetchBlockHeight, fetchPublicBalance, fetchUsdcxBalance, fetchUsadBalance, fetchAleoPrice } from '../services/api';

const CONTRACTS = {
  income: 'credaris_income_v3.aleo',
  credit: 'credaris_credit_v3.aleo',
  lending: 'credaris_lending_v5.aleo',
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
        const [balance, usdcxBal, usadBal, aleoPrice, attestationCount, hasScore, hasActiveLoan, blockHeight] = await Promise.all([
          fetchPublicBalance(address),
          fetchUsdcxBalance(address),
          fetchUsadBalance(address),
          fetchAleoPrice(),
          fetchMappingValue(CONTRACTS.income, 'attestation_count', address),
          fetchMappingValue(CONTRACTS.credit, 'has_score', address),
          fetchMappingValue(CONTRACTS.lending, 'has_active_loan', address),
          fetchBlockHeight(),
        ]);
        
        setData({
          aleoBalance: balance || 0,
          usdcxBalance: usdcxBal || 0,
          usadBalance: usadBal || 0,
          aleoPrice: aleoPrice || 0,
          hasIncomeStatus: attestationCount ? parseInt(String(attestationCount).replace(/u\d+$/g, ''), 10) > 0 : false,
          hasCreditScore: hasScore === true || String(hasScore) === 'true',
          hasActiveLoan: hasActiveLoan === true || String(hasActiveLoan) === 'true',
          blockHeight: typeof blockHeight === 'number' ? blockHeight : parseInt(blockHeight, 10),
        });
      } catch (e) {
        console.error('Dashboard fetch error:', e);
        setData({ aleoBalance: 0, usdcxBalance: 0, usadBalance: 0, aleoPrice: 0, hasIncomeStatus: false, hasCreditScore: false, hasActiveLoan: false, blockHeight: 0 });
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

  const aleoBal = data ? (data.aleoBalance / 1_000_000) : 0;
  const aleoUsd = data && data.aleoPrice > 0 ? (aleoBal * data.aleoPrice) : 0;
  const usdcxBal = data ? (data.usdcxBalance / 1_000_000) : 0;
  const usadBal = data ? (data.usadBalance / 1_000_000) : 0;

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
              <div className={`token-card${usdcxBal > 0 ? ' active' : ''}`} style={{ '--token-color': '#2775ca' }}>
                <div className="token-card-symbol">USDCx</div>
                <div className="token-card-name">USD Coin (Aleo)</div>
                <div className="token-card-desc">test_usdcx_stablecoin.aleo</div>
                <div className="token-card-balance">{usdcxBal.toFixed(2)}</div>
                {usdcxBal > 0 && <div className="token-card-usd">≈ ${usdcxBal.toFixed(2)}</div>}
              </div>
              <div className={`token-card${usadBal > 0 ? ' active' : ''}`} style={{ '--token-color': '#10b981' }}>
                <div className="token-card-symbol">USAD</div>
                <div className="token-card-name">Aleo Dollar</div>
                <div className="token-card-desc">Algorithmic stablecoin</div>
                <div className="token-card-balance">{usadBal.toFixed(2)}</div>
                {usadBal > 0 && <div className="token-card-usd">≈ ${usadBal.toFixed(2)}</div>}
              </div>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon">🔐</div>
              <div className="stat-label">Income Status</div>
              <div className="stat-val" style={{ color: data?.hasIncomeStatus ? 'var(--emerald)' : 'var(--text-3)', fontSize: '20px' }}>
                {data?.hasIncomeStatus ? 'Verified via ZK' : 'Not Verified'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 8 }}>
                {data?.hasIncomeStatus ? 'Encrypted Record on-chain' : 'Public mapping empty'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🛡️</div>
              <div className="stat-label">Credit Score</div>
              <div className="stat-val" style={{ color: data?.hasCreditScore ? 'var(--emerald)' : 'var(--text-3)', fontSize: '20px' }}>
                {data?.hasCreditScore ? 'Computed & Private' : 'No Data'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 8 }}>
                {data?.hasCreditScore ? <a href="/credit" style={{ color: 'var(--indigo-light)', textDecoration: 'none' }}>Unlock to view locally ↗</a> : 'Compute score first'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏦</div>
              <div className="stat-label">Active Loans</div>
              <div className="stat-val" style={{ color: data?.hasActiveLoan ? 'var(--amber)' : 'var(--emerald)', fontSize: '20px' }}>
                {data?.hasActiveLoan ? '1 Active Loan' : 'None'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 8 }}>
                {data?.hasActiveLoan ? 'Terms stored privately' : 'Ready to borrow'}
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
