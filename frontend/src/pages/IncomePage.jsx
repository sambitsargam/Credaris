import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchTransactionsByAddress, fetchBlockHeight, fetchPublicBalance } from '../services/api';
import { analyzeIncome } from '../services/incomeAnalyzer';

const TOKENS = [
  { symbol: 'ALEO', name: 'Aleo Credits', color: '#e8613c' },
  { symbol: 'USDCx', name: 'USD Coin', color: '#2775ca' },
  { symbol: 'USAD', name: 'Aleo Dollar', color: '#10b981' },
];

export default function IncomePage() {
  const { address, connected, executeTransaction, transactionStatus } = useWallet();
  const [analyzing, setAnalyzing] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [incomeData, setIncomeData] = useState(null);
  const [txState, setTxState] = useState(null);
  const [error, setError] = useState(null);
  const [selectedToken, setSelectedToken] = useState('ALEO');
  const [walletBalance, setWalletBalance] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (address) fetchPublicBalance(address).then(setWalletBalance).catch(() => {});
  }, [address]);

  const handleAnalyze = async () => {
    if (!address) return;
    setAnalyzing(true);
    setError(null);
    setIncomeData(null);
    try {
      const txs = await fetchTransactionsByAddress(address);
      const data = analyzeIncome(txs, address);
      if (data.txCount === 0) {
        setError('No incoming credit transfers found for this address. Try sending some test credits first.');
      }
      setIncomeData(data);
    } catch (err) {
      setError(`Failed to fetch transactions: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAttest = async () => {
    if (!connected || !incomeData || incomeData.txCount === 0) return;
    setAttesting(true);
    setTxState({ type: 'pending', msg: 'Submitting income attestation to credaris_income_v1.aleo...' });
    try {
      const result = await executeTransaction({
        program: 'credaris_income_v1.aleo',
        function: 'attest_income',
        inputs: [
          address,
          `${incomeData.totalIncome}u64`,
          `${incomeData.txCount}u64`,
          `${incomeData.avgIncome}u64`,
          `${incomeData.periodStart}u32`,
          `${incomeData.periodEnd}u32`,
        ],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `Broadcasting: ${result.transactionId}` });
        pollRef.current = setInterval(async () => {
          try {
            const res = await transactionStatus(result.transactionId);
            if (res && res.status && res.status.toLowerCase() !== 'pending') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              if (res.status.toLowerCase() === 'accepted') {
                setTxState({ type: 'ok', msg: `Confirmed! TX: ${result.transactionId}` });
              } else {
                setTxState({ type: 'err', msg: `TX failed: ${res.error || res.status}` });
              }
              setAttesting(false);
            }
          } catch (e) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setTxState({ type: 'err', msg: e.message });
            setAttesting(false);
          }
        }, 3000);
      }
    } catch (err) {
      setTxState({ type: 'err', msg: err.message });
      setAttesting(false);
    }
  };

  if (!connected) {
    return (
      <div className="app-layout">
        <div className="card"><div className="empty"><div className="empty-icon">🔗</div><p>Connect your wallet to verify income</p></div></div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">Income Verification</h1>
        <p className="page-desc">Analyze on-chain credit transfers and generate a ZK income attestation</p>
      </div>

      {/* Token selector + current balance */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div className="card-title">Select Token</div>
          <div className="badge badge-info">Balance: {(walletBalance / 1_000_000).toFixed(4)} ALEO</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {TOKENS.map(t => (
            <button key={t.symbol}
              className={`btn ${selectedToken === t.symbol ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              style={selectedToken === t.symbol ? { background: t.color, boxShadow: `0 4px 16px ${t.color}40` } : {}}
              onClick={() => setSelectedToken(t.symbol)}
            >
              {t.symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Transaction Analysis</div>
              <div className="card-sub">Scans {selectedToken === 'ALEO' ? 'credits.aleo' : selectedToken.toLowerCase() + '.aleo'} transfers via Explorer API</div>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing} style={{ width: '100%' }}>
            {analyzing ? <><span className="spin"></span>Scanning blockchain...</> : `🔍 Analyze ${selectedToken} Income`}
          </button>

          {error && <div className="tx-toast err">⚠️ {error}</div>}

          {incomeData && incomeData.txCount > 0 && (
            <div className="rows" style={{ marginTop: 24 }}>
              <div className="row">
                <span className="row-label">Total Income</span>
                <span className="row-val" style={{ color: 'var(--emerald)' }}>{(incomeData.totalIncome / 1_000_000).toFixed(4)} {selectedToken}</span>
              </div>
              <div className="row">
                <span className="row-label">Incoming Transfers</span>
                <span className="row-val">{incomeData.txCount}</span>
              </div>
              <div className="row">
                <span className="row-label">Average per TX</span>
                <span className="row-val">{(incomeData.avgIncome / 1_000_000).toFixed(4)} {selectedToken}</span>
              </div>
              <div className="row">
                <span className="row-label">Block Range</span>
                <span className="row-val mono">{incomeData.periodStart.toLocaleString()} → {incomeData.periodEnd.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Generate ZK Proof</div>
              <div className="card-sub">Execute credaris_income_v1.aleo::attest_income</div>
            </div>
          </div>

          {incomeData && incomeData.txCount > 0 ? (
            <>
              <div className="preview">
                <div className="row">
                  <span className="row-label">Income</span>
                  <span className="mono" style={{ color: 'var(--text-2)' }}>{incomeData.totalIncome}u64</span>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="row-label">TX Count</span>
                  <span className="mono" style={{ color: 'var(--text-2)' }}>{incomeData.txCount}u64</span>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="row-label">Avg Income</span>
                  <span className="mono" style={{ color: 'var(--text-2)' }}>{incomeData.avgIncome}u64</span>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="row-label">Period</span>
                  <span className="mono" style={{ color: 'var(--text-2)' }}>{incomeData.periodStart}u32 → {incomeData.periodEnd}u32</span>
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleAttest} disabled={attesting} style={{ width: '100%' }}>
                {attesting ? <><span className="spin"></span>Generating proof...</> : '⚡ Submit Income Attestation'}
              </button>
            </>
          ) : (
            <p style={{ color: 'var(--text-4)', fontSize: 14 }}>Run the analysis first to generate a proof.</p>
          )}

          {txState && (
            <div className={`tx-toast ${txState.type}`}>
              {txState.type === 'pending' && <span className="spin"></span>}
              {txState.type === 'ok' && '✅'}
              {txState.type === 'err' && '❌'}
              <span>{txState.msg}</span>
            </div>
          )}
        </div>

        {incomeData && incomeData.transfers.length > 0 && (
          <div className="card grid-full">
            <div className="card-head">
              <div className="card-title">Incoming Transfers</div>
              <span className="badge badge-ok">{incomeData.transfers.length} found</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Amount</th>
                    <th>Block</th>
                    <th>Function</th>
                    <th>From</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeData.transfers.slice(0, 20).map((t, i) => (
                    <tr key={i}>
                      <td>
                        <a href={`https://testnet.explorer.provable.com/transaction/${t.txId}`}
                           target="_blank" rel="noopener noreferrer"
                           style={{ color: 'var(--accent-light)' }}>
                          {t.txId.slice(0, 16)}…
                        </a>
                      </td>
                      <td className="mono">{(t.amount / 1_000_000).toFixed(4)}</td>
                      <td className="mono">{t.blockHeight.toLocaleString()}</td>
                      <td><span className="badge badge-info">{t.function}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{t.sender ? `${t.sender.slice(0, 10)}…` : '—'}</td>
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
