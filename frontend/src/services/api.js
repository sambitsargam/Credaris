const BASE = 'https://api.explorer.provable.com/v2/testnet';

export async function fetchBlockHeight() {
  const res = await fetch(`${BASE}/block/height/latest`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchTransactionsByAddress(address) {
  let allTxs = [];
  try {
    for (let page = 0; page < 4; page++) {
      const res = await fetch(`${BASE}/transactions/address/${address}?page=${page}&limit=50`);
      if (!res.ok) break;
      const data = await res.json();
      const batch = Array.isArray(data) ? data : (data.transactions || []);
      if (batch.length === 0) break;
      allTxs.push(...batch);
      if (batch.length < 50) break;
    }
  } catch (e) {
    if (allTxs.length === 0) throw new Error(`API failed: ${e.message}`);
  }
  return allTxs;
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
