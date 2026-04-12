/**
 * aleoHash.js
 * Computes request_hash matching core_credaris.aleo::request_loan
 * Uses Plaintext.fromString() to match Leo's exact bit serialization.
 *
 * In Leo, BHP256::hash_to_field(amount as u128) serializes the value
 * as a Plaintext literal (including type info) before hashing.
 * Using Plaintext.fromString("1000000u128").toBitsLe() ensures
 * we get the exact same bit representation as the on-chain computation.
 */

let _wasm = null;

async function getWasm() {
  if (_wasm) return _wasm;
  _wasm = await import('@provablehq/wasm/testnet.js');
  return _wasm;
}

/**
 * Compute the request_hash for a loan request.
 * Matches the exact BHP256 hash chain in credaris_core_v8.aleo.
 */
export async function computeRequestHash(amount, duration, collateral, nonce, borrower) {
  const wasm = await getWasm();
  const { BHP256, Plaintext, Field } = wasm;

  const hasher = new BHP256();

  // Use Plaintext to serialize values exactly as Leo does
  const ptAmt = Plaintext.fromString(`${BigInt(amount)}u128`);
  const ptDur = Plaintext.fromString(`${BigInt(duration)}u128`);
  const ptCol = Plaintext.fromString(`${BigInt(collateral)}u128`);
  const ptBor = Plaintext.fromString(borrower);

  // Hash each input via Plaintext bits (matches Leo's BHP256::hash_to_field)
  const h1 = hasher.hash(ptAmt.toBitsLe());
  const h2 = hasher.hash(ptDur.toBitsLe());
  const h3 = hasher.hash(ptCol.toBitsLe());
  const h4 = hasher.hash(ptBor.toBitsLe());

  // Chained: hash(field + field) — field addition then hash the result as Plaintext
  const fNonce = Field.fromString(nonce);

  const sum1 = h1.add(h2);
  const pt1 = Plaintext.fromString(sum1.toString());
  const c1 = hasher.hash(pt1.toBitsLe());

  const sum2 = c1.add(h3);
  const pt2 = Plaintext.fromString(sum2.toString());
  const c2 = hasher.hash(pt2.toBitsLe());

  const sum3 = c2.add(fNonce);
  const pt3 = Plaintext.fromString(sum3.toString());
  const c3 = hasher.hash(pt3.toBitsLe());

  const sum4 = c3.add(h4);
  const pt4 = Plaintext.fromString(sum4.toString());
  const requestHash = hasher.hash(pt4.toBitsLe());

  return requestHash.toString();
}
