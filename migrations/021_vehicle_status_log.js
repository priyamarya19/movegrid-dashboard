// Unified vehicle state history: every status transition with its reason —
// manual button changes, returns, replacements, recoveries, allotments. Powers
// the "Vehicle History" timeline. vehicle_repairs is superseded going forward.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.vehicle_status_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vehicle_id uuid NOT NULL REFERENCES ${S}.vehicles(id),
      from_status text,
      to_status text NOT NULL,
      reason text,
      source text NOT NULL CHECK (source IN ('manual','return','replacement','recovery','allotment')),
      actor text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS vehicle_status_log_vehicle_idx ON ${S}.vehicle_status_log (vehicle_id, created_at DESC)`);
};
