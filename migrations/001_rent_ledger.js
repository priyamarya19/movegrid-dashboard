// Rent rolling-balance ledger: daily_rent on assignments, the rent_dues table,
// and the extended vehicle status set. Mirrors scripts/phase1-rent-ledger.js's
// schema half (that script also regenerates dues data, which stays a script).
module.exports.up = async ({ client, S }) => {
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS daily_rent numeric`);
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS paid_through_date date`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.rent_dues (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id uuid NOT NULL REFERENCES ${S}.rider_vehicle_assignments(id) ON DELETE CASCADE,
      rider_id uuid NOT NULL,
      vehicle_id uuid NOT NULL,
      week_no int NOT NULL,
      period_start date NOT NULL,
      period_end date NOT NULL,
      due_date date NOT NULL,
      amount numeric NOT NULL,
      created_at timestamptz DEFAULT now(),
      UNIQUE(assignment_id, week_no)
    )`);
  // Widen the vehicle status set to the values the status workflow uses.
  await client.query(`ALTER TABLE ${S}.vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check`);
  await client.query(`ALTER TABLE ${S}.vehicles ADD CONSTRAINT vehicles_status_check CHECK (status = ANY (ARRAY[
    'available','assigned','maintenance','retired','blocked',
    'returned','under_maintenance','mechanically_ok','ready_to_deploy']))`);
};
