import React, { useEffect, useState } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { Link } from 'react-router-dom';
import { fetchMappingValue, fetchBlockHeight, fetchPublicBalance, fetchUsdcxBalance, fetchUsadBalance, fetchAleoPrice } from '../services/api';

const TIER_CONFIG = {
  1: { letter: 'A', label: 'Excellent', color: '#10b981', glow: 'rgba(16,185,129,0.15)', collateral: '10%' },
  2: { letter: 'B', label: 'Good', color: '#60a5fa', glow: 'rgba(96,165,250,0.15)', collateral: '25%' },
  3: { letter: 'C', label: 'Fair', color: '#f59e0b', glow: 'rgba(245,158,11,0.15)', collateral: '40%' },
  4: { letter: 'D', label: 'Building Credit', color: '#f59e0b', glow: 'rgba(245,158,11,0.15)', collateral: '200%' },
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
        const [balance, usdcxBal, usadBal, aleoPrice, attestationCount, hasScore, creditTier, hasActiveLoan, blockHeight] = await Promise.all([
          fetchPublicBalance(address),
          fetchUsdcxBalance(address),
          fetchUsadBalance(address),
          fetchAleoPrice(),
          fetchMappingValue('core_credaris.aleo', 'attestation_count', address),
          fetchMappingValue('core_credaris.aleo', 'has_score', address),
          fetchMappingValue('core_credaris.aleo', 'credit_tier', address),
          fetchMappingValue('core_credaris.aleo', 'has_active_loan', address),
          fetchBlockHeight(),
        ]);

        const tierVal = creditTier ? parseInt(String(creditTier).replace(/u\d+$/g, ''), 10) : 0;

        setData({
          aleoBalance: balance || 0,
          usdcxBalance: usdcxBal || 0,
          usadBalance: usadBal || 0,
          aleoPrice: aleoPrice || 0,
          hasIncomeStatus: attestationCount ? parseInt(String(attestationCount).replace(/u\d+$/g, ''), 10) > 0 : false,
          hasCreditScore: hasScore === true || String(hasScore) === 'true',
          tierVal,
          hasActiveLoan: hasActiveLoan === true || String(hasActiveLoan) === 'true',
          blockHeight: typeof blockHeight === 'number' ? blockHeight : parseInt(blockHeight, 10),
        });
      } catch (e) {
        console.error('Dashboard fetch error:', e);
        setData({ aleoBalance: 0, usdcxBalance: 0, usadBalance: 0, aleoPrice: 0, hasIncomeStatus: false, hasCreditScore: false, tierVal: 0, hasActiveLoan: false, blockHeight: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, [address, connected]);

  if (!connected) {
    return (
      <div className="app-layout">
        <div className="card" style={{ textAlign: 'center', padding: '80px 32px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--text-0)' }}>Connect Your Wallet</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 15, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
            Connect your Aleo wallet to access the Credaris lending protocol. Your data stays private with zero-knowledge proofs.
          </p>
          <div className="trust-badges" style={{ justifyContent: 'center' }}>
            <span className="trust-badge"><span className="trust-badge-icon">🔒</span> ZK Secured</span>
            <span className="trust-badge"><span className="trust-badge-icon">⚡</span> Atomic</span>
            <span className="trust-badge"><span className="trust-badge-icon">🧠</span> Private</span>
          </div>
        </div>
      </div>
    );
  }

  const aleoBal = data ? (data.aleoBalance / 1_000_000) : 0;
  const aleoUsd = data && data.aleoPrice > 0 ? (aleoBal * data.aleoPrice) : 0;
  const usdcxBal = data ? (data.usdcxBalance / 1_000_000) : 0;
  const usadBal = data ? (data.usadBalance / 1_000_000) : 0;

  const tier = data?.tierVal ? TIER_CONFIG[data.tierVal] : null;

  // Determine next action
  const getNextAction = () => {
    if (!data) return null;
    if (!data.hasIncomeStatus) return {
      icon: '🔍', title: 'Verify Your Income',
      desc: 'Analyze your on-chain transactions to generate a private income proof.',
      to: '/income',
    };
    if (!data.hasCreditScore) return {
      icon: '🛡', title: 'Compute Your Credit Score',
      desc: 'Generate your ZK credit score to unlock borrowing with lower collateral.',
      to: '/credit',
    };
    if (!data.hasActiveLoan) return {
      icon: '🚀', title: `You're Ready to Borrow`,
      desc: `Your credit is verified. Request a loan with ${tier?.collateral || '—'} collateral.`,
      to: '/lending',
    };
    return {
      icon: '💳', title: 'Manage Your Active Loan',
      desc: 'View your loan details and make repayments.',
      to: '/lending',
    };
  };

  const nextAction = getNextAction();

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
        <div className="card"><div className="empty"><span className="spin"></span><p style={{ marginTop: 16 }}>Loading your profile...</p></div></div>
      ) : (
        <>
          {/* 1. HERO CREDIT TIER */}
          <div className="hero-tier-card" style={{ '--tier-glow': tier?.glow || 'rgba(90,90,110,0.1)' }}>
            <div className="hero-tier-label">Your Credit Tier</div>
            {tier ? (
              <>
                <div className="hero-tier-value" style={{ color: tier.color }}>
                  Tier {tier.letter}
                  <span style={{ fontSize: 20, fontWeight: 600, marginLeft: 12, color: 'var(--text-2)' }}>— {tier.label}</span>
                </div>
                <div className="hero-tier-meta">
                  Collateral Required: <strong style={{ color: 'var(--text-1)' }}>{tier.collateral}</strong> · Interest Rate: <strong style={{ color: 'var(--text-1)' }}>5.00% APR</strong>
                </div>
              </>
            ) : (
              <>
                <div className="hero-tier-value" style={{ color: 'var(--text-3)' }}>
                  No Score Yet
                </div>
                <div className="hero-tier-desc">Complete income verification and credit scoring to unlock your tier.</div>
              </>
            )}
            <div className="hero-tier-actions">
              {tier ? (
                <>
                  <Link to="/lending" className="btn btn-primary">🚀 Request Loan</Link>
                  <Link to="/credit" className="btn btn-ghost">Improve Score</Link>
                </>
              ) : (
                <Link to={data?.hasIncomeStatus ? '/credit' : '/income'} className="btn btn-primary">
                  {data?.hasIncomeStatus ? '🛡 Compute Score' : '🔍 Verify Income'}
                </Link>
              )}
            </div>
          </div>

          {/* 2. DYNAMIC NEXT ACTION */}
          {nextAction && (
            <Link to={nextAction.to} className="next-action-card">
              <div className="next-action-icon">{nextAction.icon}</div>
              <div className="next-action-body">
                <div className="next-action-title">{nextAction.title}</div>
                <div className="next-action-desc">{nextAction.desc}</div>
              </div>
              <div className="next-action-arrow">→</div>
            </Link>
          )}

          {/* 3. WALLET BALANCES */}
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
                <div className="token-card-desc">Stablecoin on Aleo</div>
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

          {/* 4. STATUS CARDS */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon">🔐</div>
              <div className="stat-label">Income Status</div>
              <div className="stat-val" style={{ color: data?.hasIncomeStatus ? 'var(--emerald)' : 'var(--text-3)', fontSize: '20px' }}>
                {data?.hasIncomeStatus ? '✅ Verified' : 'Not Verified'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 8 }}>
                {data?.hasIncomeStatus ? 'Private proof stored on-chain' : <Link to="/income" style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>Verify now →</Link>}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏦</div>
              <div className="stat-label">Active Loans</div>
              <div className="stat-val" style={{ color: data?.hasActiveLoan ? 'var(--amber)' : 'var(--emerald)', fontSize: '20px' }}>
                {data?.hasActiveLoan ? '⚡ 1 Active' : 'None'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 8 }}>
                {data?.hasActiveLoan ? <Link to="/lending" style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>Manage loan →</Link> : 'Ready to borrow'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
