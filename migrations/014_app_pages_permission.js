// Per-user "app pages" permission: which dashboard sections a user can open from
// the mobile app's hamburger menu. Empty array (default) = no menu at all.
// Managed from Settings → Users; the app receives it at login and via profile.
module.exports.up = async ({ client, A }) => {
  await client.query(`ALTER TABLE ${A}.users ADD COLUMN IF NOT EXISTS app_pages text[] NOT NULL DEFAULT '{}'`);
};
