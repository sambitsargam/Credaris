const BASE = 'https://api.explorer.provable.com/v2/testnet';

export async function fetchBlockHeight() {
  const res = await fetch(`${BASE}/block/height/latest`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchTransactionsByAddress(address) {
  let allTxs = [];
  let nextBlock = null;
  let nextTransition = null;

  try {
    const PROVABLE_API = 'https://api.provable.com/v2/testnet';
    const programs = 'credits.aleo,test_usad_stablecoin.aleo,test_usdcx_stablecoin.aleo';
    
    // The v2 API uses cursor-based pagination via block_number & transition_id
    // Max limit per request is 50. Follow next_cursor to get all pages.
    for (let i = 0; i < 40; i++) { // safety cap: 40 pages × 50 = 2000 txs max
      let url = `${PROVABLE_API}/transactions/address/${address}?limit=50&direction=next&sort=desc&program_id=${encodeURIComponent(programs)}`;
      
      if (nextBlock !== null && nextTransition !== null) {
        url += `&block_number=${nextBlock}&transition_id=${nextTransition}`;
      }

      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();

      const batch = data.transactions || [];
      if (batch.length === 0) break;
      allTxs.push(...batch);

      // Check for next page cursor
      const cursor = data.next_cursor;
      if (!cursor || typeof cursor.block_number === 'undefined' || !cursor.transition_id) break;

      // If cursor hasn't changed, we've exhausted all pages
      if (cursor.block_number === nextBlock && cursor.transition_id === nextTransition) break;

      nextBlock = cursor.block_number;
      nextTransition = cursor.transition_id;

      // If we got fewer than 50 results (the limit), it's the last page
      if (batch.length < 50) break;
    }
  } catch (e) {
    if (allTxs.length === 0) throw new Error(`API failed: ${e.message}`);
  }

  // Deduplicate by transaction_id + transition_id combo
  const seen = new Set();
  const unique = [];
  for (const tx of allTxs) {
    const key = `${tx.transaction_id}_${tx.transition_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tx);
    }
  }

  return unique;
}

export async function fetchMappingValue(programId, mappingName, key) {
  const res = await fetch(`${BASE}/program/${programId}/mapping/${mappingName}/${key}`);
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text === 'null') return null;
  try { return JSON.parse(text); } catch { return text; }
}

export async function fetchProgram(programId) {
  const res = await fetch(`${BASE}/program/${programId}`);
  if (!res.ok) return null;
  return res.text();
}

function parseAmount(raw) {
  if (!raw) return 0;
  const str = String(raw).replace(/['"]/g, '').replace(/u\d+$/g, '').trim();
  return parseInt(str, 10) || 0;
}

// credits.aleo -> mapping account -> u64 (microcredits, 6 decimals)
export async function fetchPublicBalance(address) {
  try {
    const res = await fetch(`${BASE}/program/credits.aleo/mapping/account/${address}`);
    if (!res.ok) return 0;
    const text = await res.text();
    return parseAmount(text);
  } catch { return 0; }
}

// test_usdcx_stablecoin.aleo -> mapping balances -> u128 (6 decimals)
export async function fetchUsdcxBalance(address) {
  try {
    const res = await fetch(`${BASE}/program/test_usdcx_stablecoin.aleo/mapping/balances/${address}`);
    if (!res.ok) return 0;
    const text = await res.text();
    return parseAmount(text);
  } catch { return 0; }
}

// test_usad_stablecoin.aleo -> mapping balances -> u128 (6 decimals)
export async function fetchUsadBalance(address) {
  try {
    const res = await fetch(`${BASE}/program/test_usad_stablecoin.aleo/mapping/balances/${address}`);
    if (!res.ok) return 0;
    const text = await res.text();
    return parseAmount(text);
  } catch { return 0; }
}

export async function fetchAleoPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=aleo&vs_currencies=usd');
    if (!res.ok) return 0;
    const data = await res.json();
    return data?.aleo?.usd || 0;
  } catch { return 0; }
}
