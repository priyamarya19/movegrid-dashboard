// Rider-app self-registration + in-app KYC: when the rider submitted their KYC
// from the app, and which vehicle class they want (low/high speed) — the choice
// that makes PAN + DL mandatory (high) or optional (low).
module.exports.up = async ({ client, S }) => {
  await client.query(`ALTER TABLE ${S}.riders ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz`);
  await client.query(`ALTER TABLE ${S}.riders ADD COLUMN IF NOT EXISTS vehicle_pref text CHECK (vehicle_pref IN ('low_speed','high_speed') OR vehicle_pref IS NULL)`);
};
