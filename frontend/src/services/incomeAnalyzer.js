export function analyzeIncome(transactions, walletAddress, aleoPrice = 0) {
  const empty = { totalIncome: 0, txCount: 0, avgIncome: 0, periodStart: 0, periodEnd: 0, transfers: [], usdEquivalent: 0, usdcxIncome: 0 };

  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    return empty;
  }

  const incoming = [];
  const seen = new Set();

  for (const tx of transactions) {
    const txId = tx.transaction_id || tx.id || '';
    if (seen.has(txId)) continue;
    seen.add(txId);

    const programId = tx.program_id || tx.program || '';

    // Skip credaris contract txs (attestations, scores, etc)
    if (programId.startsWith('credaris_')) continue;

    // Only include credits.aleo and test_usdcx_stablecoin.aleo transfers
    const isCredits = programId === 'credits.aleo' || programId === '';
    const isUsdcx = programId === 'test_usdcx_stablecoin.aleo' || programId === 'test_usdcx_bridge.aleo';

    if (!isCredits && !isUsdcx) continue;

    const isRecipient =
      tx.recipient_address === walletAddress ||
      tx.recipient === walletAddress ||
      (tx.outputs && tx.outputs.some && tx.outputs.some(o =>
        typeof o === 'string' ? o.includes(walletAddress) :
        (o.value && typeof o.value === 'string' && o.value.includes(walletAddress))
      ));

    if (!isRecipient) continue;

    const amount = tx.amount || tx.value || 0;
    if (amount <= 0) continue;

    incoming.push({
      txId,
      amount,
      blockHeight: tx.block_number || tx.block_height || tx.height || 0,
      timestamp: parseInt(tx.block_timestamp || tx.timestamp || '0', 10),
      program: programId || 'credits.aleo',
      function: tx.function_id || tx.function || 'transfer_public',
      sender: tx.sender_address || tx.sender || '',
      token: isUsdcx ? 'USDCx' : 'ALEO',
    });
  }

  if (incoming.length === 0) return empty;

  // Separate ALEO and USDCx income
  const aleoTransfers = incoming.filter(t => t.token === 'ALEO');
  const usdcxTransfers = incoming.filter(t => t.token === 'USDCx');

  const aleoIncome = aleoTransfers.reduce((sum, t) => sum + t.amount, 0);
  const usdcxIncome = usdcxTransfers.reduce((sum, t) => sum + t.amount, 0);

  // Convert USDCx to ALEO equivalent: USDCx is pegged to $1, so USDCx_amount / aleo_price = ALEO equivalent
  let usdcxAsAleo = 0;
  if (usdcxIncome > 0 && aleoPrice > 0) {
    const usdcxUsd = usdcxIncome / 1_000_000; // USDCx in dollars
    usdcxAsAleo = Math.floor((usdcxUsd / aleoPrice) * 1_000_000); // Convert to microcredits
  }

  const totalIncome = aleoIncome + usdcxAsAleo;
  const txCount = incoming.length;
  const avgIncome = Math.floor(totalIncome / txCount);
  const heights = incoming.map(t => t.blockHeight).filter(h => h > 0);
  const periodStart = heights.length > 0 ? Math.min(...heights) : 0;
  const periodEnd = heights.length > 0 ? Math.max(...heights) : 0;

  const aleoAmount = totalIncome / 1_000_000;
  const usdEquivalent = aleoPrice > 0 ? aleoAmount * aleoPrice : 0;

  return {
    totalIncome,
    txCount,
    avgIncome,
    periodStart,
    periodEnd,
    transfers: incoming,
    usdEquivalent,
    usdcxIncome,
    aleoIncome,
    usdcxAsAleo,
    aleoPrice,
  };
}
