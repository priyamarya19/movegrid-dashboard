// Migration: session revocation support on auth.users.
//
// token_version is embedded in every JWT at sign time and re-checked against the
// DB on each guarded request. Bumping it (on deactivate, role change, or password
// change) instantly invalidates all of that user's outstanding tokens instead of
// letting them keep full access until the 8h expiry. password_changed_at is kept
// for audit/visibility.
// Idempotent. Targets the schema in .env.local (RDS_ENV-aware).
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const A = (process.env.RDS_ENV || env.RDS_ENV) === "uat" ? "uat_auth" : "auth";

(async () => {
  await client.connect();
  await client.query(`ALTER TABLE ${A}.users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0`);
  await client.query(`ALTER TABLE ${A}.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz`);
  console.log(`✓ token_version + password_changed_at ready on ${A}.users`);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
