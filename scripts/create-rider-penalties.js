// Migration: rider_penalties table. Idempotent. Targets the schema in .env.local.
//   node scripts/create-rider-penalties.js
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";

(async () => {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS ${S}.rider_penalties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id uuid NOT NULL REFERENCES ${S}.riders(id) ON DELETE CASCADE,
    vehicle_id uuid REFERENCES ${S}.vehicles(id),
    assignment_id uuid REFERENCES ${S}.rider_vehicle_assignments(id),
    amount numeric,
    detail text,
    status text NOT NULL DEFAULT 'pending',
    created_by text,
    created_at timestamptz DEFAULT now())`);
  await client.query(`CREATE INDEX IF NOT EXISTS rider_penalties_rider_idx ON ${S}.rider_penalties(rider_id)`);
  console.log(`✓ ${S}.rider_penalties ready`);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
