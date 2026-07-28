// Rider-app authentication: OTP challenges for login-by-mobile, and a
// token_version on riders so a rider session can be revoked (mirrors the staff
// users pattern from migration 007).
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.rider_otps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mobile text NOT NULL,
      otp_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts int NOT NULL DEFAULT 0,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS rider_otps_mobile_idx ON ${S}.rider_otps (mobile, created_at DESC)`);
  await client.query(`ALTER TABLE ${S}.riders ADD COLUMN IF NOT EXISTS token_version int NOT NULL DEFAULT 0`);
};
