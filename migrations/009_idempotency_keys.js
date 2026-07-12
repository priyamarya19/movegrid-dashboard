// Server-side idempotency store for the mobile app's Idempotency-Key header,
// so a timed-out-then-retried money write can't record twice.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.idempotency_keys (
      key text NOT NULL,
      scope text NOT NULL,
      user_id text,
      status text NOT NULL DEFAULT 'pending',
      response_status int,
      response_body jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (scope, key)
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_idempotency_created ON ${S}.idempotency_keys (created_at)`);
};
