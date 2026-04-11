import React, { useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AleoWalletProvider, useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { WalletModalProvider, WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield';
import { LeoWalletAdapter } from '@provablehq/aleo-wallet-adaptor-leo';
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core';
import { Network } from '@provablehq/aleo-types';
import '@provablehq/aleo-wallet-adaptor-react-ui/dist/styles.css';
import './styles/index.css';

import Landing from './pages/Landing';
import DashboardPage from './pages/DashboardPage';
import IncomePage from './pages/IncomePage';
import CreditPage from './pages/CreditPage';
import LendingPage from './pages/LendingPage';
import DocsPage from './pages/DocsPage';

const SIDEBAR_LINKS = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/income', icon: '🔍', label: 'Income' },
  { to: '/credit', icon: '🛡', label: 'Credit' },
  { to: '/lending', icon: '🏦', label: 'Lending' },
  { to: '/docs', icon: '📚', label: 'Docs' },
];

const EXPLORER_LINKS = [
  { label: 'Income Contract', url: 'https://testnet.explorer.provable.com/program/credaris_income_v3.aleo' },
  { label: 'Credit Contract', url: 'https://testnet.explorer.provable.com/program/credaris_credit_v4.aleo' },
  { label: 'Lending Contract', url: 'https://testnet.explorer.provable.com/program/credaris_lending_v8.aleo' },
];

function Sidebar({ open, onToggle }) {
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
        <div className="sidebar-section-label">Main</div>
        {SIDEBAR_LINKS.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <span className="sidebar-link-icon">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-nav" style={{ marginTop: 8 }}>
        <div className="sidebar-section-label">Explorer</div>
        {EXPLORER_LINKS.map(link => (
          <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="sidebar-link">
            <span className="sidebar-link-icon">↗</span>
            {link.label}
          </a>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-network">
          <span className="sidebar-network-dot" />
          Aleo Testnet
        </div>
        <div className="sidebar-tokens">
          <span className="sidebar-token">ALEO</span>
          <span className="sidebar-token">USDCx</span>
          <span className="sidebar-token">USAD</span>
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
          Built on <a href="https://aleo.org" target="_blank" rel="noopener noreferrer">Aleo</a> · Zero-Knowledge Proofs · Privacy by Default
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
          Built on <a href="https://aleo.org" target="_blank" rel="noopener noreferrer">Aleo</a> · Zero-Knowledge Proofs · Privacy by Default
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
        'credaris_income_v3.aleo',
        'credaris_credit_v4.aleo',
        'credaris_lending_v8.aleo',
      ]}
      onError={(error) => console.error('Wallet error:', error)}
    >
      <WalletModalProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<AppShell />} />
          </Routes>
        </BrowserRouter>
      </WalletModalProvider>
    </AleoWalletProvider>
  );
}
