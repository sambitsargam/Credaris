export function analyzeIncome(transactions, walletAddress) {
  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    return { totalIncome: 0, txCount: 0, avgIncome: 0, periodStart: 0, periodEnd: 0, transfers: [] };
  }

  const incoming = [];

  for (const tx of transactions) {
    if (tx.recipient_address === walletAddress && tx.amount > 0) {
      incoming.push({
        txId: tx.transaction_id,
        amount: tx.amount,
        blockHeight: tx.block_number,
        timestamp: parseInt(tx.block_timestamp || '0', 10),
        program: tx.program_id,
        function: tx.function_id,
        sender: tx.sender_address,
      });
    }
  }

  if (incoming.length === 0) {
    return { totalIncome: 0, txCount: 0, avgIncome: 0, periodStart: 0, periodEnd: 0, transfers: [] };
  }

  const totalIncome = incoming.reduce((sum, t) => sum + t.amount, 0);
  const txCount = incoming.length;
  const avgIncome = Math.floor(totalIncome / txCount);
  const heights = incoming.map(t => t.blockHeight).filter(h => h > 0);
  const periodStart = heights.length > 0 ? Math.min(...heights) : 0;
  const periodEnd = heights.length > 0 ? Math.max(...heights) : 0;

  return { totalIncome, txCount, avgIncome, periodStart, periodEnd, transfers: incoming };
}
