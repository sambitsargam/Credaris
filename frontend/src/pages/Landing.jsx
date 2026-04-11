import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui';
import { fetchBlockHeight } from '../services/api';

const PROGRAMS = [
  { id: 'credaris_income_v3', name: 'Income Verification', icon: '🔍', url: 'https://testnet.explorer.provable.com/program/credaris_income_v3.aleo' },
  { id: 'credaris_credit_v4', name: 'Credit Scoring', icon: '📊', url: 'https://testnet.explorer.provable.com/program/credaris_credit_v4.aleo' },
  { id: 'credaris_lending_v9', name: 'Lending Protocol', icon: '🏦', url: 'https://testnet.explorer.provable.com/program/credaris_lending_v9.aleo' },
];

function HeroSection() {
  const navigate = useNavigate();
  return (
    <section className="landing-hero">
      <div className="hero-pill">
        <span className="hero-pill-icon">🛡</span>
        Built on Aleo — Zero-Knowledge Privacy
      </div>
      <h1>
        Step Into The Future Of<br />
        <span className="accent-text">Financial Identity</span>
      </h1>
      <p className="hero-desc">
        Privacy-preserving income verification, ZK credit scoring, and
        decentralized lending. Every proof is encrypted on-chain — only you
        can see your data.
      </p>
      <div className="hero-btns">
        <WalletMultiButton />
        <button className="btn btn-outline" onClick={() => navigate('/dashboard')}>
          🚀 Go to Dashboard
        </button>
      </div>
    </section>
  );
}

function LivePreviewSection() {
  const [blockHeight, setBlockHeight] = useState('—');

  useEffect(() => {
    fetchBlockHeight()
      .then(h => setBlockHeight(Number(h).toLocaleString()))
      .catch(() => {});
  }, []);

  return (
    <div className="hero-preview">
      <div className="preview-card">
        <div className="preview-card-head">
          <span className="preview-card-title">Deployed Programs</span>
          <span className="preview-tab">Live</span>
        </div>
        {PROGRAMS.map(p => (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="preview-row" key={p.id}>
            <div className="preview-row-icon">{p.icon}</div>
            <span className="preview-row-name">{p.name}</span>
            <span className="preview-row-val">.aleo ↗</span>
          </a>
        ))}
      </div>

      <div className="preview-card">
        <div className="preview-card-head">
          <span className="preview-card-title">Network</span>
          <span className="preview-tab">Testnet</span>
        </div>
        <div className="preview-big">{blockHeight}</div>
        <div className="preview-label">Current Block Height</div>
        <div style={{ marginTop: 20 }}>
          <svg viewBox="0 0 300 60" style={{ width: '100%', height: 60 }}>
            <polyline fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              points="0,50 30,45 60,48 90,30 120,35 150,20 180,25 210,15 240,22 270,10 300,18" />
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
            <polygon fill="url(#areaGrad)"
              points="0,50 30,45 60,48 90,30 120,35 150,20 180,25 210,15 240,22 270,10 300,18 300,60 0,60" />
          </svg>
        </div>
      </div>

      <div className="preview-card">
        <div className="preview-card-head">
          <span className="preview-card-title">ZK Record Types</span>
          <span className="preview-tab">Private</span>
        </div>
        {[
          { icon: '📄', name: 'IncomeProof', type: 'Record' },
          { icon: '📋', name: 'CreditReport', type: 'Record' },
          { icon: '🤝', name: 'LoanAgreement', type: 'Record' },
        ].map(p => (
          <div className="preview-row" key={p.name}>
            <div className="preview-row-icon">{p.icon}</div>
            <span className="preview-row-name">{p.name}</span>
            <span className="preview-row-val">{p.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: '🛡',
      title: 'Private by Default',
      desc: 'Income data, credit scores, and loan positions are stored as encrypted Aleo records. No one sees your financial data — only you can decrypt it.',
    },
    {
      icon: '⚡',
      title: 'On-Chain Verification',
      desc: 'Scan credits.aleo transfer history via the Provable Explorer API. Compute totals, averages, and generate attestation proofs in real-time.',
    },
    {
      icon: '🔒',
      title: 'Deterministic Scoring',
      desc: 'Credit scores are computed from income frequency, average amounts, repayment history, and missed payments — all deterministic, no oracles needed.',
    },
    {
      icon: '🏛',
      title: 'Enforced Lending Rules',
      desc: 'No self-lending, no overpayment, bounded interest rates (≤50%), and automatic loan closure on full repayment. Enforced by the Leo contract.',
    },
  ];

  return (
    <section className="land-section">
      <div className="section-label">Core Features</div>
      <h2 className="section-title">
        Powerful Features For{' '}
        <span className="accent-text">Private Finance</span>
      </h2>
      <p className="section-desc">
        Privacy-native financial identity built on Aleo's zero-knowledge blockchain.
      </p>
      <div className="feat-grid">
        {features.map(f => (
          <div className="feat-card" key={f.title}>
            <div className="feat-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShowcaseSection() {
  const showcases = [
    {
      badge: '🔍 Income Verification',
      title: 'Verify Income,',
      accent: 'Stay Private',
      desc: 'Credaris scans on-chain credit transfers received by your address, computes total income, average per transaction, and block range — then generates a private attestation proof.',
      program: PROGRAMS[0],
      link: '/income',
      linkText: 'Verify Income →',
      rows: [
        { k: 'Source', v: 'credits.aleo' },
        { k: 'Function', v: 'transfer_public' },
        { k: 'Output', v: 'IncomeProof (record)' },
        { k: 'On-chain', v: 'verified_incomes mapping' },
      ],
      visualTitle: 'Transaction Analysis',
    },
    {
      badge: '📊 Credit Scoring',
      title: 'Build Your Score,',
      accent: 'Zero-Knowledge',
      desc: 'Aggregate income frequency, average amounts, repayment history, and missed payments into a deterministic credit score — computed entirely on-chain with no oracles.',
      program: PROGRAMS[1],
      link: '/credit',
      linkText: 'Check Credit Score →',
      rows: [
        { k: 'Inputs', v: 'income, repayments, missed' },
        { k: 'Function', v: 'compute_score' },
        { k: 'Output', v: 'CreditReport (record)' },
        { k: 'On-chain', v: 'credit_scores mapping' },
      ],
      visualTitle: 'Score Computation',
    },
    {
      badge: '🏦 Lending Protocol',
      title: 'Borrow & Lend,',
      accent: 'Fully On-Chain',
      desc: 'Request loans backed by your verified credit score. Interest rates are bounded (≤50%), self-lending is blocked, overpayment is prevented, and full repayment auto-closes.',
      program: PROGRAMS[2],
      link: '/lending',
      linkText: 'Access Lending →',
      rows: [
        { k: 'Request', v: 'LoanRequest (record)' },
        { k: 'Approve', v: 'LoanAgreement (record)' },
        { k: 'Repay', v: 'repay_loan transition' },
        { k: 'On-chain', v: 'loan_count, total_repaid' },
      ],
      visualTitle: 'Loan Lifecycle',
    },
  ];

  return (
    <section className="land-section" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 40 }}>
      {showcases.map((s, i) => (
        <div className="showcase" key={s.badge} style={i % 2 === 1 ? { direction: 'rtl' } : {}}>
          <div style={i % 2 === 1 ? { direction: 'ltr' } : {}}>
            <div className="showcase-badge">{s.badge}</div>
            <h2>
              {s.title}<br />
              <span className="accent-text">{s.accent}</span>
            </h2>
            <p>
              {s.desc}{' '}
              <a href={s.program.url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent-light)', fontFamily: 'var(--mono)', fontSize: 13 }}>{s.program.id}.aleo ↗</a>
            </p>
            <a href={s.link} className="btn btn-accent">
              {s.linkText}
            </a>
          </div>
          <div className="showcase-visual" style={i % 2 === 1 ? { direction: 'ltr' } : {}}>
            <div className="preview-card-head">
              <span className="preview-card-title">{s.visualTitle}</span>
              <span className="preview-tab">Live</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {s.rows.map(r => (
                <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{r.k}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent-light)' }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    { n: '1', icon: '🔗', t: 'Connect Wallet', d: 'Link your Shield or Leo wallet to the Aleo testnet' },
    { n: '2', icon: '📈', t: 'Analyze Income', d: 'Scan credit transfers received by your address' },
    { n: '3', icon: '🧮', t: 'Compute Score', d: 'Generate your ZK credit score from on-chain data' },
    { n: '4', icon: '💰', t: 'Access Lending', d: 'Request loans backed by verifiable financial data' },
  ];

  return (
    <section className="land-section">
      <div className="section-label">How It Works</div>
      <h2 className="section-title">How It Works</h2>
      <p className="section-desc">
        Four steps from wallet connection to verified financial identity.
      </p>
      <div className="steps-grid">
        {steps.map(s => (
          <div className="step-card" key={s.n}>
            <div className="step-num">{s.n}</div>
            <div style={{ fontSize: 28, marginBottom: 12 }}>{s.icon}</div>
            <h4>{s.t}</h4>
            <p>{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PrivacySection() {
  const items = [
    {
      icon: '🛡',
      title: 'Encrypted Records',
      desc: 'Income proofs, credit reports, and loan agreements are stored as private Aleo records. Only the owner can decrypt them.',
    },
    {
      icon: '🔒',
      title: 'Private Execution',
      desc: 'All transitions use self.signer checks. Records cannot be accessed in finalize blocks — enforced by the Leo compiler.',
    },
    {
      icon: '📦',
      title: 'Selective Disclosure',
      desc: 'Share only the proof, not the data. Verifiers confirm your score without seeing income amounts, transfer history, or loan terms.',
    },
  ];

  return (
    <section className="land-section">
      <div className="section-label">Privacy Model</div>
      <h2 className="section-title">Privacy Model</h2>
      <p className="section-desc">
        Every design decision prioritizes user privacy.
      </p>
      <div className="privacy-grid">
        {items.map(item => (
          <div className="privacy-card" key={item.title}>
            <div className="privacy-icon">{item.icon}</div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ArchitectureSection() {
  const rows = [
    { label: 'Frontend', tags: ['React 19', 'Vite 6', 'Vanilla CSS', 'Wallet Adapter'] },
    { label: 'Wallet', tags: ['Shield Wallet', 'Leo Wallet', 'Record Decryption'] },
    { label: 'Contracts', tags: ['credaris_income_v3', 'credaris_credit_v4', 'credaris_lending_v9'] },
    { label: 'API', tags: ['Provable Explorer v2', 'Block Height', 'Mapping Queries'] },
    { label: 'Chain', tags: ['Aleo Testnet', 'Leo 4.0', 'Final Blocks', 'ZK Proofs'] },
  ];

  return (
    <section className="land-section">
      <div className="section-label">Architecture</div>
      <h2 className="section-title">Architecture</h2>
      <p className="section-desc">
        Full-stack privacy from frontend to blockchain.
      </p>
      {rows.map(r => (
        <div className="arch-row" key={r.label}>
          <span className="arch-label">{r.label}</span>
          <div className="arch-tags">
            {r.tags.map(t => (
              <span className="arch-tag" key={t}>{t}</span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function TechStackSection() {
  const techs = [
    { name: 'Shield Wallet', desc: 'Delegated proving wallet' },
    { name: 'Leo 4.0', desc: 'Zero-knowledge language' },
    { name: 'credits.aleo', desc: 'Native token program' },
    { name: 'Provable API', desc: 'Explorer & indexer' },
    { name: 'Final Blocks', desc: 'On-chain state updates' },
    { name: 'Aleo Records', desc: 'Private encrypted data' },
  ];

  return (
    <section className="land-section" style={{ paddingTop: 0 }}>
      <div className="section-label">Built With</div>
      <h2 className="section-title">Built on Proven Technology</h2>
      <p className="section-desc">
        Every component is designed for privacy and security.
      </p>
      <div className="tech-grid">
        {techs.map(t => (
          <div className="tech-card" key={t.name}>
            <h4>{t.name}</h4>
            <p>{t.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContractsSection() {
  return (
    <section className="land-section" style={{ paddingTop: 0 }}>
      <div className="section-label">Deployed Contracts</div>
      <h2 className="section-title">Live on Aleo Testnet</h2>
      <p className="section-desc">
        Three independent Leo programs deployed and verifiable on-chain.
      </p>
      <div className="privacy-grid">
        {PROGRAMS.map(p => (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="privacy-card" key={p.id} style={{ textDecoration: 'none' }}>
            <div className="privacy-icon">{p.icon}</div>
            <h3>{p.id}.aleo</h3>
            <p>{p.name} — view transitions, mappings, and source code on the Provable Explorer.</p>
            <span style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: 'var(--accent-light)', fontFamily: 'var(--mono)' }}>
              View on Explorer ↗
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function CTASection() {
  const navigate = useNavigate();
  return (
    <section className="land-section">
      <div className="cta-section">
        <h2>
          Ready to Build Your{' '}
          <span className="accent-text">Financial Identity?</span>
        </h2>
        <p>
          Join the first financial identity layer where your income, credit score,
          and loans are protected by zero-knowledge proofs.
        </p>
        <div className="cta-btns">
          <WalletMultiButton />
          <button className="btn btn-outline" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </button>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div>
      <HeroSection />
      <LivePreviewSection />
      <FeaturesSection />
      <ShowcaseSection />
      <HowItWorksSection />
      <PrivacySection />
      <ArchitectureSection />
      <ContractsSection />
      <TechStackSection />
      <CTASection />
    </div>
  );
}
