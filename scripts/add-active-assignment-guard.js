// Migration: DB backstop against a vehicle being actively assigned to two riders.
//
// The allotments API now locks the vehicle row (SELECT ... FOR UPDATE), but this
// partial unique index guarantees at most one active assignment per vehicle even
// if some other code path ever inserts without the lock. Partial (WHERE status =
// 'active') so historical returned rows for the same vehicle don't collide.
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
  // Guard: refuse to create the index if the data already violates it, with a
  // clear message, rather than failing on an opaque unique-violation.
  const dupes = await client.query(
    `SELECT vehicle_id, COUNT(*) n FROM ${S}.rider_vehicle_assignments
     WHERE status = 'active' GROUP BY vehicle_id HAVING COUNT(*) > 1`
  );
  if (dupes.rows.length) {
    console.error(`❌ ${dupes.rows.length} vehicle(s) already have >1 active assignment — resolve before indexing:`);
    console.error(dupes.rows.map((r) => `   vehicle ${r.vehicle_id}: ${r.n} active`).join("\n"));
    process.exit(1);
  }
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_active_assignment_per_vehicle
     ON ${S}.rider_vehicle_assignments (vehicle_id) WHERE status = 'active'`
  );
  console.log(`✓ uq_active_assignment_per_vehicle ready on ${S}.rider_vehicle_assignments`);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
