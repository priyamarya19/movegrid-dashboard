// Migration: add bank_status to investor_profiles for the bank-verification workflow.
// Values: 'verified' (default) | 'pending' (investor changed bank, awaiting admin verify).
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

// Apply to whichever schema is active for this environment.
const ops = process.env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";

async function run() {
  await pool.query(
    `ALTER TABLE ${ops}.investor_profiles
       ADD COLUMN IF NOT EXISTS bank_status text NOT NULL DEFAULT 'verified'`
  );
  await pool.query(
    `ALTER TABLE ${ops}.investor_profiles
       DROP CONSTRAINT IF EXISTS investor_profiles_bank_status_check`
  );
  await pool.query(
    `ALTER TABLE ${ops}.investor_profiles
       ADD CONSTRAINT investor_profiles_bank_status_check
       CHECK (bank_status IN ('verified', 'pending'))`
  );
  console.log(`bank_status column ensured on ${ops}.investor_profiles`);
  await pool.end();
}

run().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
