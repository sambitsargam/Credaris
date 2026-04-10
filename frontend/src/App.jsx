import React, { useMemo } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
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

function Navbar() {
  const { address, connected } = useWallet();
  const navigate = useNavigate();
  return (
    <nav className="nav" id="navbar">
      <div className="nav-left">
        <div className="nav-brand" onClick={() => navigate('/')}>
          <img src="/logo.svg" alt="Credaris" className="nav-logo" />
          <span className="nav-wordmark">Credaris</span>
        </div>
        {connected && (
          <div className="nav-links">
            <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Dashboard</NavLink>
            <NavLink to="/income" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Income</NavLink>
            <NavLink to="/credit" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Credit</NavLink>
            <NavLink to="/lending" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>Lending</NavLink>
          </div>
        )}
      </div>
      <div className="nav-right">
        <div className="nav-network">Testnet</div>
        <WalletMultiButton />
      </div>
    </nav>
  );
}

function AppRoutes() {
  const { connected } = useWallet();
  return (
    <Routes>
      <Route path="/" element={connected ? <DashboardPage /> : <Landing />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/income" element={<IncomePage />} />
      <Route path="/credit" element={<CreditPage />} />
      <Route path="/lending" element={<LendingPage />} />
    </Routes>
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
        'credaris_income_v1.aleo',
        'credaris_credit_v1.aleo',
        'credaris_lending_v1.aleo',
      ]}
      onError={(error) => console.error('Wallet error:', error)}
    >
      <WalletModalProvider>
        <BrowserRouter>
          <Navbar />
          <AppRoutes />
          <footer className="footer">
            Built on <a href="https://aleo.org" target="_blank" rel="noopener noreferrer">Aleo</a> · Zero-Knowledge Proofs · Privacy by Default
          </footer>
        </BrowserRouter>
      </WalletModalProvider>
    </AleoWalletProvider>
  );
}
