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

    // Discard outgoing transfers fully
    const sender = tx.sender || tx.sender_address || '';
    if (sender === walletAddress) continue; 

    // Expand into specific transition blocks
    let transitions = [];
    if (tx.execution && tx.execution.transitions) {
      transitions = tx.execution.transitions;
    } else if (tx.transitions) {
      transitions = tx.transitions;
    } else {
      transitions = [tx];
    }

    let foundIncome = false;

    for (const transition of transitions) {
      const prog = transition.program || transition.program_id || tx.program || tx.program_id || 'credits.aleo';
      const func = transition.function || transition.function_id || tx.function || tx.function_id || '';

      if (prog.startsWith('credaris_')) continue;

      const isCredits = prog === 'credits.aleo';
      const isUsdcx = prog === 'test_usdcx_stablecoin.aleo' || prog === 'test_usdcx_bridge.aleo';
      const isUsad = prog === 'test_usad_stablecoin.aleo';

      if (!isCredits && !isUsdcx && !isUsad) continue;
      if (!func.includes('transfer')) continue;

      let isRecipient = false;
      let parsedAmount = 0;

      // Extract from deep inputs specifically (Aleo native)
      if (transition.inputs && Array.isArray(transition.inputs)) {
        // Find if any input value maps exactly to this address
        const hasWallet = transition.inputs.some(i => {
           let val = typeof i === 'object' ? (i.value || '') : String(i);
           return val.includes(walletAddress);
        });

        if (hasWallet) {
          isRecipient = true;
          // In standard Aleo transfer inputs, the amount is usually the u64 string
          const amtObj = transition.inputs.find(i => {
            let val = typeof i === 'object' ? (i.value || '') : String(i);
            return val.endsWith('u64');
          });
          if (amtObj) {
            let val = typeof amtObj === 'object' ? (amtObj.value || '') : String(amtObj);
            parsedAmount = parseInt(val.replace(/u\d+$/g, ''), 10) || 0;
          }
        }
      }

      // Fallback for flattened API results
      if (!isRecipient && (transition.recipient === walletAddress || transition.recipient_address === walletAddress || tx.recipient === walletAddress)) {
        isRecipient = true;
      }
      if (isRecipient && parsedAmount === 0 && (transition.amount || transition.value || tx.amount || tx.value)) {
         parsedAmount = parseInt(String(transition.amount || transition.value || tx.amount || tx.value).replace(/u\d+$/g, ''), 10) || 0;
      }

      if (isRecipient && parsedAmount > 0) {
        incoming.push({
          txId,
          amount: parsedAmount,
          blockHeight: tx.block_number || tx.block_height || tx.height || 0,
          timestamp: parseInt(tx.block_timestamp || tx.timestamp || '0', 10),
          program: prog,
          function: func,
          sender: sender,
          token: isUsdcx ? 'USDCx' : (isUsad ? 'USAD' : 'ALEO'),
        });
        foundIncome = true;
        break; 
      }
    }

    if (foundIncome) seen.add(txId);
  }

  if (incoming.length === 0) return empty;

  // Separate ALEO and stablecoin income natively 
  const aleoTransfers = incoming.filter(t => t.token === 'ALEO');
  const usdcxTransfers = incoming.filter(t => t.token === 'USDCx');
  const usadTransfers = incoming.filter(t => t.token === 'USAD');

  const aleoIncome = aleoTransfers.reduce((sum, t) => sum + t.amount, 0);
  const usdcxIncome = usdcxTransfers.reduce((sum, t) => sum + t.amount, 0);
  const usadIncome = usadTransfers.reduce((sum, t) => sum + t.amount, 0);

  // Convert stablecoins back to native ALEO mapping thresholds natively
  let usdcxAsAleo = 0;
  let usadAsAleo = 0;
  if (usdcxIncome > 0 && aleoPrice > 0) {
    const usdcxUsd = usdcxIncome / 1_000_000; 
    usdcxAsAleo = Math.floor((usdcxUsd / aleoPrice) * 1_000_000); 
  }
  if (usadIncome > 0 && aleoPrice > 0) {
    const usadUsd = usadIncome / 1_000_000;
    usadAsAleo = Math.floor((usadUsd / aleoPrice) * 1_000_000);
  }

  const totalIncome = aleoIncome + usdcxAsAleo + usadAsAleo;
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
    usadIncome,
    aleoIncome,
    usdcxAsAleo,
    usadAsAleo,
    aleoPrice,
  };
}
