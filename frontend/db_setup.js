import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://postgres:WiV8mlcrOeD0POBQ@db.avauywiodtsmayfdvnqg.supabase.co:5432/postgres'
});

async function setup() {
  await client.connect();
  const query = `
    CREATE TABLE IF NOT EXISTS public.loan_requests (
      request_hash text PRIMARY KEY,
      borrower text NOT NULL,
      amount numeric NOT NULL,
      duration numeric NOT NULL,
      collateral numeric NOT NULL,
      nonce text NOT NULL,
      risk_level text NOT NULL,
      created_at timestamp with time zone default timezone('utc'::text, now()) NOT NULL
    );
  `;
  await client.query(query);
  console.log('loan_requests table initialized.');
  await client.end();
}

setup().catch(console.error);
