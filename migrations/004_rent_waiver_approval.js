// Rent-waiver approval workflow: a per-user permission (on the AUTH schema) and
// the pending-request table (on the ops schema).
module.exports.up = async ({ client, S, A }) => {
  await client.query(`ALTER TABLE ${A}.users ADD COLUMN IF NOT EXISTS can_approve_rent_waivers boolean NOT NULL DEFAULT false`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.rent_waiver_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id uuid NOT NULL REFERENCES ${S}.riders(id),
      assignment_id uuid NOT NULL REFERENCES ${S}.rider_vehicle_assignments(id),
      non_functional_days integer NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      requested_by text,
      requested_at timestamptz NOT NULL DEFAULT now(),
      approved_by text,
      approved_at timestamptz
    )`);
};
