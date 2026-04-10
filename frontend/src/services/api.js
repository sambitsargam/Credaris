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
  return data.transactions || [];
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

export async function fetchPublicBalance(address) {
  const res = await fetch(`${BASE}/program/credits.aleo/mapping/account/${address}`);
  if (!res.ok) return 0;
  const text = await res.text();
  if (!text || text === 'null') return 0;
  const cleaned = text.replace(/['"]/g, '').replace('u64', '');
  return parseInt(cleaned, 10) || 0;
}
