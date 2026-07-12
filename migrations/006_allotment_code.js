// Two-ID model: per-tenancy allotment code (the rent sheet's User ID) + the
// ops sheet note, plus the sequence that issues new allotment codes.
module.exports.up = async ({ client, S }) => {
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS allotment_code text`);
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS sheet_note text`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_rva_allotment_code ON ${S}.rider_vehicle_assignments(allotment_code)`);
  await client.query(`CREATE SEQUENCE IF NOT EXISTS ${S}.allotment_code_seq`);
  // rider_code_seq exists from the base schema; the app now issues 'MGR' codes.
  await client.query(`CREATE SEQUENCE IF NOT EXISTS ${S}.rider_code_seq`);
};
