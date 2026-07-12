// Spare-parts / repair tracking per vehicle. rider_name_raw keeps the sheet's
// original text even when the rider_id can't be resolved.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.vehicle_repairs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vehicle_id uuid NOT NULL REFERENCES ${S}.vehicles(id) ON DELETE CASCADE,
      rider_id uuid REFERENCES ${S}.riders(id),
      rider_name_raw text,
      part_name text,
      amount numeric NOT NULL,
      repair_date date,
      payment_mode text,
      payment_reference text,
      notes text,
      recorded_by text,
      created_at timestamptz DEFAULT now()
    )`);
};
