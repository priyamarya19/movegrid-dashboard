// Migration: report_recipients table. Idempotent. Targets the schema in .env.local.
//   node scripts/create-report-recipients.js
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";

(async () => {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS ${S}.report_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_key text NOT NULL,
    email text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    UNIQUE (report_key, email))`);
  console.log(`✓ ${S}.report_recipients ready`);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
