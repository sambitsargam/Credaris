const BASE = 'https://api.explorer.provable.com/v2/testnet';

export async function fetchBlockHeight() {
  const res = await fetch(`${BASE}/block/height/latest`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchTransactionsByAddress(address) {
  const res = await fetch(`${BASE}/transactions/address/${address}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.transactions)) return data.transactions;
  return [];
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

// No USAD program deployed yet - returns 0
export async function fetchUsadBalance(address) {
  return 0;
}

export async function fetchAleoPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=aleo&vs_currencies=usd');
    if (!res.ok) return 0;
    const data = await res.json();
    return data?.aleo?.usd || 0;
  } catch { return 0; }
}
