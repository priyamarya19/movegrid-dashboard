// Migration: payment mode + proof image for penalties, rent payments, and submission settlement.
// A proof image is mandatory in the UI (screenshot for online, photo of cash for cash).
// Idempotent. Targets the schema in .env.local.  node scripts/add-payment-proof.js
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";

(async () => {
  await client.connect();
  // penalty payment: status already exists (pending/paid/waived); add mode + utr + proof
  await client.query(`ALTER TABLE ${S}.rider_penalties ADD COLUMN IF NOT EXISTS payment_mode text`);
  await client.query(`ALTER TABLE ${S}.rider_penalties ADD COLUMN IF NOT EXISTS payment_utr text`);
  await client.query(`ALTER TABLE ${S}.rider_penalties ADD COLUMN IF NOT EXISTS payment_proof_url text`);
  await client.query(`ALTER TABLE ${S}.rider_penalties ADD COLUMN IF NOT EXISTS paid_at timestamptz`);
  // rent payment: payment_screenshot_url already exists; add mode + utr
  await client.query(`ALTER TABLE ${S}.rider_payments ADD COLUMN IF NOT EXISTS payment_mode text`);
  await client.query(`ALTER TABLE ${S}.rider_payments ADD COLUMN IF NOT EXISTS payment_utr text`);
  // submission settlement proof (final rent cleared at return)
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS rent_settlement_mode text`);
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS rent_settlement_utr text`);
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS rent_settlement_proof_url text`);
  console.log(`✓ payment mode + proof columns ready on ${S}`);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
