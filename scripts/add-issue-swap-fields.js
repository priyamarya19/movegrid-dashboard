// Migration: is_issue_swap + non_functional_days on rider_vehicle_assignments.
//
// Set on the OLD assignment at return time when a vehicle is swapped due to a
// hardware/technical fault (not a normal end-of-tenancy return) — the rider is
// getting a replacement immediately and shouldn't lose the rent days they'd
// already paid for, or be charged for days the vehicle was non-functional.
// The allotment endpoint looks these up on the rider's most-recently-returned
// assignment to carry paid_through_date forward instead of starting fresh.
// Idempotent. Targets the schema in .env.local.
//   node scripts/add-issue-swap-fields.js
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = (process.env.RDS_ENV || env.RDS_ENV) === "uat" ? "mg_data_uat" : "mg_data";

(async () => {
  await client.connect();
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS is_issue_swap boolean NOT NULL DEFAULT false`);
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS non_functional_days integer NOT NULL DEFAULT 0`);
  console.log("✓ is_issue_swap + non_functional_days columns ready on", S);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
