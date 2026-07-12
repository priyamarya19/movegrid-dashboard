// Migration: idempotency_keys — server-side dedupe for mobile money writes.
//
// The mobile app sends an Idempotency-Key header on money/state POSTs/PATCHes so
// a timed-out-but-actually-succeeded request that the operator re-taps doesn't
// create a duplicate rent payment / allotment / penalty. This table records the
// first result per key; a replay returns the stored response instead of writing
// again. Rows older than the retention window are ignored (and can be swept).
// Idempotent. Targets the schema in .env.local (RDS_ENV-aware).
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = (process.env.RDS_ENV || env.RDS_ENV) === "uat" ? "mg_data_uat" : "mg_data";

(async () => {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.idempotency_keys (
      key text NOT NULL,
      scope text NOT NULL,
      user_id text,
      status text NOT NULL DEFAULT 'pending',   -- 'pending' | 'done'
      response_status int,
      response_body jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (scope, key)
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_idempotency_created ON ${S}.idempotency_keys (created_at)`);
  console.log(`✓ idempotency_keys ready on ${S}`);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
