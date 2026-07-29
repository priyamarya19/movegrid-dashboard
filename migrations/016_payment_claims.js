// Rider-submitted payment claims (rider app Week 2): the rider pays via any UPI
// app and uploads proof; the claim sits 'pending' until ops verifies it. Approval
// runs the normal rent-received logic — claims never touch the ledger directly.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.payment_claims (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id uuid NOT NULL REFERENCES ${S}.riders(id),
      amount numeric NOT NULL CHECK (amount > 0),
      utr text,
      screenshot_url text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      reject_reason text,
      reviewed_by text,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS payment_claims_status_idx ON ${S}.payment_claims (status, created_at)`);
  await client.query(`CREATE INDEX IF NOT EXISTS payment_claims_rider_idx ON ${S}.payment_claims (rider_id, created_at DESC)`);
};
