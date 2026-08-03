// Per-investor deal terms: when earning starts (admin-entered, 1st of month
// after deployment), how many instalments the deal runs (24 default, varies),
// the ROI %, and the per-scooter price the investment was made at.
module.exports.up = async ({ client, S }) => {
  await client.query(`ALTER TABLE ${S}.investor_profiles ADD COLUMN IF NOT EXISTS payout_start_date date`);
  await client.query(`ALTER TABLE ${S}.investor_profiles ADD COLUMN IF NOT EXISTS payout_term_months int NOT NULL DEFAULT 24`);
  await client.query(`ALTER TABLE ${S}.investor_profiles ADD COLUMN IF NOT EXISTS roi_percent numeric`);
  await client.query(`ALTER TABLE ${S}.investor_profiles ADD COLUMN IF NOT EXISTS scooter_price numeric`);
};
