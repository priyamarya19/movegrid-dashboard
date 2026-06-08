// Migration: add period_month + proof_url to investor_payouts so admins can
// record a payment for a specific month with an attached receipt.
const { Pool } = require("pg");
require("dotenv").config({ path: ".env.local" });

const pool = new Pool({
  host: process.env.RDS_HOST,
  port: Number(process.env.RDS_PORT) || 5432,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  database: process.env.RDS_DATABASE,
  ssl: { rejectUnauthorized: false },
});

const ops = process.env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";

async function run() {
  await pool.query(`ALTER TABLE ${ops}.investor_payouts ADD COLUMN IF NOT EXISTS period_month date`);
  await pool.query(`ALTER TABLE ${ops}.investor_payouts ADD COLUMN IF NOT EXISTS proof_url text`);
  await pool.query(`ALTER TABLE ${ops}.investor_payouts ADD COLUMN IF NOT EXISTS note text`);
  console.log(`period_month, proof_url, note ensured on ${ops}.investor_payouts`);
  await pool.end();
}

run().catch((e) => { console.error("Migration failed:", e.message); process.exit(1); });
