// Session revocation + single-use reset tokens (AUTH schema). If these columns
// are missing the app fails closed, so this must run before the code deploys.
module.exports.up = async ({ client, A }) => {
  await client.query(`ALTER TABLE ${A}.users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0`);
  await client.query(`ALTER TABLE ${A}.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz`);
};
