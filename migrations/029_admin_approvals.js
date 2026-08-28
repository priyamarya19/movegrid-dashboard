// Admin approval for the actions ops shouldn't be able to do alone.
//
// Two cases to start with: correcting a rider's details after their record is
// complete, and setting a rent start date the clock doesn't justify (the 3 PM
// rule). Both are moments where a keystroke moves money, so a named admin has
// to say yes.
//
// The shape is a one-time code: ops ask, the chosen admins are emailed a code,
// the admin reads it back over the phone, ops type it in. That suits a hub
// where the manager isn't sitting at a dashboard — the alternative, an approval
// queue someone has to notice, stalls the rider standing at the counter.
//
// The request stores a FINGERPRINT of what was approved, not just "approved":
// otherwise a code issued for "start date 29 Aug" could be spent on any other
// date, which is the obvious way this kind of gate gets defeated in practice.
module.exports.up = async ({ client, S, A }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.approval_requests (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      action        text NOT NULL,          -- 'rider_edit' | 'allotment_start_date'
      subject_id    uuid,                   -- rider being edited, where there is one
      -- What the admin is being asked to approve, in words, for the email and
      -- the audit trail afterwards.
      summary       text NOT NULL,
      -- Canonical string of the fields that matter. The mutation re-derives it
      -- and refuses if it differs, so an approval cannot be reused for
      -- something else.
      fingerprint   text NOT NULL,
      code_hash     text NOT NULL,
      attempts      int  NOT NULL DEFAULT 0,
      status        text NOT NULL DEFAULT 'pending',  -- pending|approved|consumed|expired|failed
      requested_by  uuid REFERENCES ${A}.users(id) ON DELETE SET NULL,
      requested_by_name text,
      approved_by   uuid REFERENCES ${A}.users(id) ON DELETE SET NULL,
      approved_by_name  text,
      sent_to       text[],                 -- admin emails the code went to
      expires_at    timestamptz NOT NULL,
      approved_at   timestamptz,
      consumed_at   timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now()
    )`);

  await client.query(
    `CREATE INDEX IF NOT EXISTS approval_requests_open_idx
       ON ${S}.approval_requests (status, created_at DESC)`
  );

  // Who may approve. Empty table = nobody, which deliberately blocks the gated
  // actions rather than silently letting them through: a gate that opens when
  // misconfigured is not a gate.
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.approval_approvers (
      user_id     uuid PRIMARY KEY REFERENCES ${A}.users(id) ON DELETE CASCADE,
      actions     text[] NOT NULL DEFAULT ARRAY['rider_edit','allotment_start_date'],
      created_by  text,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`);

  // Seed with the active admins so the feature works on day one; Priyam can
  // narrow it from Settings.
  await client.query(`
    INSERT INTO ${S}.approval_approvers (user_id, created_by)
    SELECT u.id, 'migration-029'
    FROM ${A}.users u
    JOIN ${A}.roles r ON r.id = u.role_id
    WHERE u.status = 'active' AND r.name = 'admin'
    ON CONFLICT (user_id) DO NOTHING`);
};
