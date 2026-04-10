export function analyzeIncome(transactions, walletAddress, aleoPrice = 0) {
  const empty = { totalIncome: 0, txCount: 0, avgIncome: 0, periodStart: 0, periodEnd: 0, transfers: [], usdEquivalent: 0 };

  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    return empty;
  }

  const incoming = [];
  const seen = new Set();

  for (const tx of transactions) {
    const txId = tx.transaction_id || tx.id || '';
    if (seen.has(txId)) continue;
    seen.add(txId);

    if (tx.program_id && tx.program_id.startsWith('credaris_')) continue;

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
      program: tx.program_id || tx.program || 'credits.aleo',
      function: tx.function_id || tx.function || 'transfer_public',
      sender: tx.sender_address || tx.sender || '',
    });
  }

  if (incoming.length === 0) return empty;

  const totalIncome = incoming.reduce((sum, t) => sum + t.amount, 0);
  const txCount = incoming.length;
  const avgIncome = Math.floor(totalIncome / txCount);
  const heights = incoming.map(t => t.blockHeight).filter(h => h > 0);
  const periodStart = heights.length > 0 ? Math.min(...heights) : 0;
  const periodEnd = heights.length > 0 ? Math.max(...heights) : 0;

  const aleoAmount = totalIncome / 1_000_000;
  const usdEquivalent = aleoPrice > 0 ? aleoAmount * aleoPrice : 0;

  return { totalIncome, txCount, avgIncome, periodStart, periodEnd, transfers: incoming, usdEquivalent };
}
