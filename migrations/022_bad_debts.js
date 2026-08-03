// Bad debt register: when a tenancy closes (return or recovery) with money
// still owed after whatever was collected at handback, the remainder becomes a
// bad-debt entry. Later payments from the defaulter are recorded against it.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.bad_debts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id uuid NOT NULL REFERENCES ${S}.riders(id),
      vehicle_id uuid REFERENCES ${S}.vehicles(id),
      assignment_id uuid REFERENCES ${S}.rider_vehicle_assignments(id),
      source text NOT NULL CHECK (source IN ('recovery','return')),
      original_outstanding numeric NOT NULL CHECK (original_outstanding > 0),
      collected_at_close numeric NOT NULL DEFAULT 0,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.bad_debt_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bad_debt_id uuid NOT NULL REFERENCES ${S}.bad_debts(id),
      amount numeric NOT NULL CHECK (amount > 0),
      payment_mode text NOT NULL,
      payment_utr text,
      proof_url text NOT NULL,
      note text,
      received_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS bad_debt_payments_debt_idx ON ${S}.bad_debt_payments (bad_debt_id)`);
};
