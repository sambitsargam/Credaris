import React, { useMemo, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AleoWalletProvider, useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletModalProvider, WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';
import { LeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo';
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core';
import { Network } from '@provablehq/aleo-types';
import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css';
import './styles/index.css';

import { IncomeProvider } from './context/IncomeContext';
import { fetchMappingValue } from './services/api';
import Landing from './pages/Landing';
import DashboardPage from './pages/DashboardPage';
import IncomePage from './pages/IncomePage';
import CreditPage from './pages/CreditPage';
import LendingPage from './pages/LendingPage';
import DocsPage from './pages/DocsPage';

function Sidebar({ open, onToggle }) {
  const { address, connected } = useWallet();
  const location = useLocation();
  const [incomeOk, setIncomeOk] = useState(false);
  const [creditOk, setCreditOk] = useState(false);

  useEffect(() => {
    if (!connected || !address) return;
    (async () => {
      try {
        const att = await fetchMappingValue('core_credaris.aleo', 'attestation_count', address);
        setIncomeOk(att ? parseInt(String(att).replace(/u\d+$/g, ''), 10) > 0 : false);
        const hs = await fetchMappingValue('core_credaris.aleo', 'has_score', address);
        setCreditOk(hs === true || String(hs) === 'true');
      } catch (e) { /* ignore */ }
    })();
  }, [connected, address]);

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-head">
        <NavLink to="/" className="sidebar-brand">
          <img src="/logo.svg" alt="Credaris" className="sidebar-logo" />
          <span className="sidebar-wordmark">Credaris</span>
        </NavLink>
        <button className="sidebar-close" onClick={onToggle} aria-label="Close sidebar">✕</button>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">🏠 Overview</div>
        <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          <span className="sidebar-link-icon">📊</span>
          Dashboard
        </NavLink>

        <div className="sidebar-section-label" style={{ marginTop: 16 }}>🔐 Identity</div>
        <NavLink to="/income" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          <span className="sidebar-link-icon">🔍</span>
          Income
          {connected && <span style={{ marginLeft: 'auto', fontSize: 12 }}>{incomeOk ? '✅' : '🔴'}</span>}
        </NavLink>
        <NavLink to="/credit" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          <span className="sidebar-link-icon">🛡</span>
          Credit Score
          {connected && <span style={{ marginLeft: 'auto', fontSize: 12 }}>{creditOk ? '✅' : '⏳'}</span>}
        </NavLink>

        <div className="sidebar-section-label" style={{ marginTop: 16 }}>💰 Lending</div>
        <NavLink to="/lending#browse" className={({ isActive }) => `sidebar-link${isActive && location.hash !== '#borrow' && location.hash !== '#repay' ? ' active' : ''}`}>
          <span className="sidebar-link-icon">🏪</span>
          Marketplace
        </NavLink>
        <NavLink to="/lending#borrow" className={() => `sidebar-link${location.pathname === '/lending' && location.hash === '#borrow' ? ' active' : ''}`}>
          <span className="sidebar-link-icon">📝</span>
          Borrow
        </NavLink>
        <NavLink to="/lending#repay" className={() => `sidebar-link${location.pathname === '/lending' && location.hash === '#repay' ? ' active' : ''}`}>
          <span className="sidebar-link-icon">💳</span>
          Repay
        </NavLink>

        <div className="sidebar-section-label" style={{ marginTop: 16 }}>📚 Resources</div>
        <NavLink to="/docs" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          <span className="sidebar-link-icon">📄</span>
          Documentation
        </NavLink>

        <div className="sidebar-divider" />

        <div className="sidebar-section-label">🔎 Explorer</div>
        <a href="https://testnet.explorer.provable.com/program/core_credaris.aleo" target="_blank" rel="noopener noreferrer" className="sidebar-link">
          <span className="sidebar-link-icon">↗</span>
          Credaris Core
        </a>
      </nav>

      <div className="sidebar-footer">
        {connected && address && (
          <div className="sidebar-wallet-panel">
            <div className="sidebar-wallet-addr">{address.slice(0, 10)}...{address.slice(-4)}</div>
            <div className="sidebar-status-row">
              <span className="sidebar-status-dot" style={{ background: 'var(--emerald)' }} />
              Testnet
            </div>
          </div>
        )}
        <div className="sidebar-network" style={{ marginTop: 12 }}>
          <span className="sidebar-network-dot" />
          Aleo Testnet
        </div>
      </div>
    </aside>
  );
}

function Topbar({ showHamburger, onMenuClick }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        {showHamburger && (
          <button className="topbar-hamburger" onClick={onMenuClick} aria-label="Menu">
            <span /><span /><span />
          </button>
        )}
        <NavLink to="/" className="topbar-brand">
          <img src="/logo.svg" alt="Credaris" className="topbar-logo" />
          <span className="topbar-wordmark">Credaris</span>
        </NavLink>
      </div>
      <div className="topbar-right">
        <div className="topbar-network">Testnet</div>
        <WalletMultiButton />
      </div>
    </header>
  );
}

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { connected } = useWallet();
  const location = useLocation();
  const isLanding = location.pathname === '/' && !connected;
  const isDocs = location.pathname === '/docs';

  if (isDocs) {
    return <DocsPage />;
  }

  if (isLanding) {
    return (
      <>
        <Topbar showHamburger={false} />
        <Landing />
        <footer className="footer">
          Built on <a href="https://aleo.org" target="_blank" rel="noopener noreferrer">Aleo</a> · Zero-Knowledge Proofs · Privacy by Default · Built by <a href="https://sambitsargam.in" target="_blank" rel="noopener noreferrer">0xSambit</a>
        </footer>
      </>
    );
  }

  return (
    <div className={`app-shell${sidebarOpen ? ' sidebar-expanded' : ''}`}>
      <Topbar showHamburger={!sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(false)} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/income" element={<IncomePage />} />
          <Route path="/credit" element={<CreditPage />} />
          <Route path="/lending" element={<LendingPage />} />
        </Routes>
        <footer className="footer">
          Built on <a href="https://aleo.org" target="_blank" rel="noopener noreferrer">Aleo</a> · Zero-Knowledge Proofs · Privacy by Default · Built by <a href="https://sambitsargam.in" target="_blank" rel="noopener noreferrer">0xSambit</a>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  const wallets = useMemo(() => [
    new ShieldWalletAdapter(),
    new LeoWalletAdapter(),
  ], []);

  return (
      <AleoWalletProvider
        wallets={wallets}
        network={Network.TESTNET}
        decryptPermission={DecryptPermission.UponRequest}
      autoConnect={true}
      programs={[
        'core_credaris.aleo',
        'credits.aleo'
      ]}
      onError={(error) => console.error('Wallet error:', error)}
    >
      <WalletModalProvider>
        <IncomeProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/*" element={<AppShell />} />
            </Routes>
          </BrowserRouter>
        </IncomeProvider>
      </WalletModalProvider>
    </AleoWalletProvider>
  );
}
