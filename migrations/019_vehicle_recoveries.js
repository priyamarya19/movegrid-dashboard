// Vehicle recoveries: when a rider stops paying and doesn't return the vehicle,
// the team physically recovers it. Distinct from a normal return — the record
// freezes the rider's outstanding at recovery time (the bad-debt register) and
// usually blacklists the rider.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.vehicle_recoveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id uuid NOT NULL REFERENCES ${S}.riders(id),
      vehicle_id uuid NOT NULL REFERENCES ${S}.vehicles(id),
      assignment_id uuid REFERENCES ${S}.rider_vehicle_assignments(id),
      recovered_date date NOT NULL,
      reason text NOT NULL,
      location text,
      notes text,
      photos text[],
      outstanding_at_recovery numeric NOT NULL DEFAULT 0,
      blacklisted boolean NOT NULL DEFAULT false,
      recovered_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS vehicle_recoveries_date_idx ON ${S}.vehicle_recoveries (recovered_date DESC)`);
};
