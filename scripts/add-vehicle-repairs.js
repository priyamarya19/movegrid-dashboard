// Migration: vehicle_repairs table.
//
// Tracks spare-parts/repair costs per vehicle (part name, amount, date, payment
// mode/reference, notes) -- data that previously only existed in an ops
// spreadsheet with no home in the schema. rider_id is best-effort (matched via
// the rider's assignment on that vehicle around repair_date) since a vehicle
// can change hands; rider_name_raw always keeps the sheet's original text so
// nothing is lost if the match is wrong or ambiguous.
// Idempotent. Targets the schema in .env.local.
//   node scripts/add-vehicle-repairs.js
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
    CREATE TABLE IF NOT EXISTS ${S}.vehicle_repairs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vehicle_id uuid NOT NULL REFERENCES ${S}.vehicles(id) ON DELETE CASCADE,
      rider_id uuid REFERENCES ${S}.riders(id),
      rider_name_raw text,
      part_name text,
      amount numeric NOT NULL,
      repair_date date,
      payment_mode text,
      payment_reference text,
      notes text,
      recorded_by text,
      created_at timestamptz DEFAULT now()
    )`);
  console.log(`✓ vehicle_repairs table ready on ${S}`);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
