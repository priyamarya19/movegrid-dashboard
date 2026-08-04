// Which hubs a staff user may see. Admins are unscoped (they see every hub);
// every other role is limited to the hubs listed here.
//
// A dedicated table rather than the older employee_profiles →
// employee_hub_assignments chain: both of those are empty, unreferenced
// scaffolding, and this needs a direct auth.users → hubs link with no hop.
module.exports.up = async ({ client, S, A }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.user_hub_access (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid NOT NULL REFERENCES ${A}.users(id) ON DELETE CASCADE,
      hub_id      uuid NOT NULL REFERENCES ${S}.hubs(id) ON DELETE CASCADE,
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  text,
      UNIQUE (user_id, hub_id)
    )`);

  await client.query(
    `CREATE INDEX IF NOT EXISTS user_hub_access_user_idx ON ${S}.user_hub_access (user_id)`
  );

  // Backfill: every active non-admin staff member gets access to every hub that
  // exists today. With a single hub this preserves exactly the current
  // behaviour — enforcement starts mattering the day a second hub opens, and
  // access can be narrowed per user from Settings → Users before then.
  await client.query(`
    INSERT INTO ${S}.user_hub_access (user_id, hub_id, created_by)
    SELECT u.id, h.id, 'migration-025'
    FROM ${A}.users u
    CROSS JOIN ${S}.hubs h
    LEFT JOIN ${A}.roles r ON r.id = u.role_id
    WHERE u.status = 'active'
      AND COALESCE(r.name, '') IN ('ops_manager', 'hub_incharge')
    ON CONFLICT (user_id, hub_id) DO NOTHING`);
};
