// Migration: continues_from_assignment_id on rider_vehicle_assignments.
//
// Set permanently (never cleared) when an allotment carries over from an issue-swap,
// so the Rent Cycle display can keep week numbers continuous across the vehicle
// change (Week 4, 5... on the new vehicle, not a fresh Week 1). This is separate from
// is_issue_swap, which is a one-time "pending consumption" flag reset to false once
// used -- this link needs to persist for as long as the assignment exists.
// Idempotent. Targets the schema in .env.local.
//   node scripts/add-continuation-link.js
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = (process.env.RDS_ENV || env.RDS_ENV) === "uat" ? "mg_data_uat" : "mg_data";

(async () => {
  await client.connect();
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS continues_from_assignment_id uuid REFERENCES ${S}.rider_vehicle_assignments(id)`);
  console.log(`✓ continues_from_assignment_id ready on ${S}.rider_vehicle_assignments`);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
