import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react';
import { fetchTransactionsByAddress, fetchBlockHeight, fetchAleoPrice, fetchPublicBalance, fetchUsdcxBalance, fetchUsadBalance } from '../services/api';
import { analyzeIncome } from '../services/incomeAnalyzer';
import { useIncomeSnapshot } from '../context/IncomeContext';

export default function IncomePage() {
  const { address, connected, executeTransaction, transactionStatus } = useWallet();
  const { setSnapshot } = useIncomeSnapshot();

  const [analyzing, setAnalyzing] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [incomeData, setIncomeData] = useState(null);
  const [txState, setTxState] = useState(null);
  const [error, setError] = useState(null);
  const [aleoPrice, setAleoPrice] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    fetchAleoPrice().then(setAleoPrice).catch(() => {});
  }, []);

  const handleAnalyze = async () => {
    if (!address) return;
    setAnalyzing(true);
    setError(null);
    setIncomeData(null);
    setTxState(null);
    try {
      const [txs, aleoBal, usdcxBal, usadBal, currentPrice] = await Promise.all([
        fetchTransactionsByAddress(address),
        fetchPublicBalance(address),
        fetchUsdcxBalance(address),
        fetchUsadBalance(address),
        fetchAleoPrice(), // Physically block execution precisely until the real-time USD index is fetched
      ]);
      
      setAleoPrice(currentPrice);
      const data = analyzeIncome(txs, address, currentPrice);

      // Check if analyzer already found transfers
      const hasAleoTx = data.transfers.some(t => t.token === 'ALEO');
      const hasUsdcxTx = data.transfers.some(t => t.token === 'USDCx');
      const hasUsadTx = data.transfers.some(t => t.token === 'USAD');

      // Use on-chain balance natively if transfers were heavily truncated or missing
      const aleoAmount = (aleoBal || 0) > data.aleoIncome ? (aleoBal || 0) - data.aleoIncome : 0;
      const usdcxAmount = hasUsdcxTx ? 0 : (usdcxBal || 0);
      const usadAmount = hasUsadTx ? 0 : (usadBal || 0);
      let usdcxAsAleo = 0;
      let usadAsAleo = 0;
      if (usdcxAmount > 0 && aleoPrice > 0) {
        usdcxAsAleo = Math.floor(((usdcxAmount / 1_000_000) / aleoPrice) * 1_000_000);
      }
      if (usadAmount > 0 && aleoPrice > 0) {
        usadAsAleo = Math.floor(((usadAmount / 1_000_000) / aleoPrice) * 1_000_000);
      }

      // Get stablecoin income already counted by analyzer from transfers
      const txUsdcxIncome = data.usdcxIncome || 0;
      const txUsadIncome = data.transfers.filter(t => t.token === 'USAD').reduce((s, t) => s + t.amount, 0);

      const totalStableAleo = (data.usdcxAsAleo || 0) + (data.usadAsAleo || 0) + usdcxAsAleo + usadAsAleo;
      const combinedIncome = data.aleoIncome + aleoAmount + totalStableAleo;
      const combinedUsd = aleoPrice > 0 ? (combinedIncome / 1_000_000) * aleoPrice : 0;

      // Add on-chain balance entries only for tokens NOT already in transfers
      const allTransfers = [...data.transfers];
      if (aleoAmount > 0) {
        allTransfers.push({
          txId: 'on-chain-balance-aleo',
          amount: aleoAmount,
          blockHeight: 0,
          program: 'credits.aleo',
          function: 'balances',
          sender: '',
          token: 'ALEO',
        });
      }
      if (usdcxAmount > 0) {
        allTransfers.push({
          txId: 'on-chain-balance',
          amount: usdcxAmount,
          blockHeight: 0,
          program: 'test_usdcx_stablecoin.aleo',
          function: 'balances',
          sender: '',
          token: 'USDCx',
        });
      }
      if (usadAmount > 0) {
        allTransfers.push({
          txId: 'on-chain-balance-usad',
          amount: usadAmount,
          blockHeight: 0,
          program: 'test_usad_stablecoin.aleo',
          function: 'balances',
          sender: '',
          token: 'USAD',
        });
      }

      const totalUsdcx = txUsdcxIncome + usdcxAmount;
      const totalUsad = txUsadIncome + usadAmount;

      const merged = {
        ...data,
        totalIncome: combinedIncome,
        txCount: allTransfers.length,
        avgIncome: allTransfers.length > 0 ? Math.floor(combinedIncome / allTransfers.length) : 0,
        usdcxIncome: totalUsdcx,
        usadIncome: totalUsad,
        usdcxAsAleo: (data.usdcxAsAleo || 0) + usdcxAsAleo,
        usadAsAleo: (data.usadAsAleo || 0) + usadAsAleo,
        usdEquivalent: combinedUsd,
        transfers: allTransfers,
      };

      if (merged.txCount === 0) {
        setError('No incoming credit transfers found for this address.');
      }
      setIncomeData(merged);
    } catch (err) {
      setError(`Failed to fetch transactions: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAttest = async () => {
    if (!connected || !incomeData || incomeData.txCount === 0) return;
    setAttesting(true);
    setTxState({ type: 'pending', msg: '⛓ Generating your private income proof...' });
    try {
      const result = await executeTransaction({
        program: 'core_credaris.aleo',
        function: 'attest_income',
        inputs: [
          address,
          `${incomeData.totalIncome}u64`,
          `${incomeData.txCount}u64`,
          `${incomeData.avgIncome}u64`,
          `${incomeData.periodStart || 0}u32`,
          `${incomeData.periodEnd || 0}u32`,
        ],
        fee: 500000,
        privateFee: false,
      });
      if (result?.transactionId) {
        setTxState({ type: 'pending', msg: `⛓ Confirming on blockchain...` });
        pollRef.current = setInterval(async () => {
          try {
            const res = await transactionStatus(result.transactionId);
            if (res && res.status && res.status.toLowerCase() !== 'pending') {
              clearInterval(pollRef.current);
              pollRef.current = null;
              if (res.status.toLowerCase() === 'accepted') {
                // Extract real TX ID (at1...) from status response
                const realTxId = [res?.transactionId, res?.transaction_id, res?.txId, res?.tx_id, res?.id]
                  .find(c => c && typeof c === 'string' && c.startsWith('at1')) || result.transactionId;
                // Save attested primitives to context (in-memory, no storage)
                setSnapshot({
                  verifiedIncome: incomeData.totalIncome,
                  txCount:        incomeData.txCount,
                  avgIncome:      incomeData.avgIncome,
                  periodStart:    incomeData.periodStart || 0,
                  periodEnd:      incomeData.periodEnd   || 0,
                });
                setTxState({ type: 'ok', msg: `✅ Income verified! Your proof is now stored privately on-chain.` });
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
        <div className="card" style={{ textAlign: 'center', padding: '60px 32px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: 'var(--text-0)' }}>Verify Your Income</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, maxWidth: 380, margin: '0 auto' }}>Connect your wallet to analyze your on-chain transactions privately.</p>
          <div className="trust-badges" style={{ justifyContent: 'center', marginTop: 20 }}>
            <span className="trust-badge"><span className="trust-badge-icon">🔒</span> ZK Secured</span>
            <span className="trust-badge"><span className="trust-badge-icon">⚡</span> Atomic</span>
            <span className="trust-badge"><span className="trust-badge-icon">🧠</span> Private</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <div className="page-header">
        <h1 className="page-title">Verify Your Income Privately</h1>
        <p className="page-desc">Your on-chain income is analyzed privately using zero-knowledge proofs. No data is shared publicly.</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Analyze Income</div>
              <div className="card-sub">Scans your wallet for incoming transfers</div>
            </div>
            {aleoPrice > 0 && (
              <div className="badge badge-info">ALEO ≈ ${aleoPrice.toFixed(2)}</div>
            )}
          </div>

          <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing} style={{ width: '100%' }}>
            {analyzing ? <><span className="spin"></span>⏳ Scanning your transactions...</> : '🔍 Analyze Income'}
          </button>

          {error && <div className="tx-toast err">⚠️ {error}</div>}

          {incomeData && incomeData.txCount > 0 && (
            <div className="rows" style={{ marginTop: 24 }}>
              <div className="row">
                <span className="row-label">Total Income (ALEO equiv.)</span>
                <span className="row-val" style={{ color: 'var(--emerald)' }}>{(incomeData.totalIncome / 1_000_000).toFixed(4)} ALEO</span>
              </div>
              {incomeData.aleoIncome > 0 && (
                <div className="row">
                  <span className="row-label">└ ALEO Credits</span>
                  <span className="row-val">{(incomeData.aleoIncome / 1_000_000).toFixed(4)} ALEO</span>
                </div>
              )}
              {incomeData.usdcxIncome > 0 && (
                <div className="row">
                  <span className="row-label">└ USDCx Stablecoin</span>
                  <span className="row-val" style={{ color: '#2775ca' }}>
                    {(incomeData.usdcxIncome / 1_000_000).toFixed(2)} USDCx
                    {incomeData.usdcxAsAleo > 0 && <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
                      (≈ {(incomeData.usdcxAsAleo / 1_000_000).toFixed(4)} ALEO)
                    </span>}
                  </span>
                </div>
              )}
              {incomeData.usadIncome > 0 && (
                <div className="row">
                  <span className="row-label">└ USAD Stablecoin</span>
                  <span className="row-val" style={{ color: '#10b981' }}>
                    {(incomeData.usadIncome / 1_000_000).toFixed(2)} USAD
                    {incomeData.usadAsAleo > 0 && <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>
                      (≈ {(incomeData.usadAsAleo / 1_000_000).toFixed(4)} ALEO)
                    </span>}
                  </span>
                </div>
              )}
              {incomeData.usdEquivalent > 0 && (
                <div className="row">
                  <span className="row-label">USD Equivalent</span>
                  <span className="row-val" style={{ color: 'var(--accent-light)' }}>≈ ${incomeData.usdEquivalent.toFixed(2)}</span>
                </div>
              )}
              <div className="row">
                <span className="row-label">Incoming Transfers</span>
                <span className="row-val">{incomeData.txCount}</span>
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
              <div className="card-title">Submit Proof</div>
              <div className="card-sub">Create a private attestation on-chain</div>
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
                  <span className="mono" style={{ color: 'var(--text-2)' }}>Block {incomeData.periodStart?.toLocaleString()} → {incomeData.periodEnd?.toLocaleString()}</span>
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleAttest} disabled={attesting} style={{ width: '100%' }}>
                {attesting ? <><span className="spin"></span>⏳ Generating proof...</> : '⚡ Submit Income Proof'}
              </button>
              <div className="trust-badges" style={{ justifyContent: 'center' }}>
                <span className="trust-badge"><span className="trust-badge-icon">🔒</span> ZK Secured</span>
                <span className="trust-badge"><span className="trust-badge-icon">🧠</span> Private</span>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-4)', fontSize: 14 }}>Analyze your transactions first to generate a proof.</p>
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
              <div className="card-title">💰 Incoming Transfers (Income)</div>
              <span className="badge badge-ok">{incomeData.transfers.length} found</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Token</th>
                    <th>Amount</th>
                    <th>Block</th>
                    <th>Function</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeData.transfers.map((t, i) => {
                    const isBalance = t.txId.startsWith('on-chain-balance');
                    const badgeColor = t.token === 'USDCx' ? '#2775ca' : t.token === 'USAD' ? '#10b981' : '#e8613c';
                    return (
                    <tr key={i}>
                      <td>
                        {isBalance ? (
                          <span style={{ color: 'var(--text-2)' }}>On-chain balance</span>
                        ) : (
                          <a href={`https://testnet.explorer.provable.com/transaction/${t.txId}`}
                             target="_blank" rel="noopener noreferrer"
                             style={{ color: 'var(--accent-light)' }}>
                            {t.txId.slice(0, 16)}…
                          </a>
                        )}
                      </td>
                      <td>
                        <span className="badge" style={{
                          background: `${badgeColor}15`,
                          color: badgeColor,
                          border: `1px solid ${badgeColor}30`,
                        }}>{t.token}</span>
                      </td>
                      <td className="mono">{(t.amount / 1_000_000).toFixed(4)}</td>
                      <td className="mono">{t.blockHeight > 0 ? t.blockHeight.toLocaleString() : '—'}</td>
                      <td><span className="badge badge-info">{t.function}</span></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {incomeData && incomeData.allTransactions && incomeData.allTransactions.length > 0 && (
          <div className="card grid-full">
            <div className="card-head">
              <div className="card-title">📋 Full Transaction History</div>
              <span className="badge badge-info">{incomeData.allTransactions.length} transactions</span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg, #1a1a2e)' }}>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Type</th>
                    <th>Program</th>
                    <th>Amount</th>
                    <th>Direction</th>
                    <th>Block</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeData.allTransactions.map((t, i) => {
                    const direction = t.isIncoming ? '⬇️ IN' : t.isOutgoing ? '⬆️ OUT' : '🔄';
                    const dirColor = t.isIncoming ? '#10b981' : t.isOutgoing ? '#ef4444' : '#888';
                    const progShort = (t.program || '').replace('.aleo', '');
                    return (
                    <tr key={i}>
                      <td>
                        <a href={`https://testnet.explorer.provable.com/transaction/${t.txId}`}
                           target="_blank" rel="noopener noreferrer"
                           style={{ color: 'var(--accent-light)' }}>
                          {(t.txId || '').slice(0, 16)}…
                        </a>
                      </td>
                      <td><span className="badge badge-info">{t.function}</span></td>
                      <td style={{ fontSize: '0.85em', color: 'var(--text-2)' }}>{progShort}</td>
                      <td className="mono">{t.amount > 0 ? (t.amount / 1_000_000).toFixed(4) : '—'}</td>
                      <td><span style={{ color: dirColor, fontWeight: 600 }}>{direction}</span></td>
                      <td className="mono">{t.blockHeight > 0 ? t.blockHeight.toLocaleString() : '—'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
