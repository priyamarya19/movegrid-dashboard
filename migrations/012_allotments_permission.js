// Per-user permission (AUTH schema) gating the Allotments list — mirrors
// can_approve_rent_waivers. Default false: nobody sees the list until an admin
// ticks the box for that user (admins included).
module.exports.up = async ({ client, A }) => {
  await client.query(`ALTER TABLE ${A}.users ADD COLUMN IF NOT EXISTS can_view_allotments boolean NOT NULL DEFAULT false`);
};
