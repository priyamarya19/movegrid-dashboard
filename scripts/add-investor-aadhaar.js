// Migration: add aadhaar_url to investor_profiles (admin-uploaded Aadhaar front image S3 key).
const { Pool } = require("pg");
require("dotenv").config({ path: ".env.local" });
const pool = new Pool({
  host: process.env.RDS_HOST, port: Number(process.env.RDS_PORT) || 5432,
  user: process.env.RDS_USER, password: process.env.RDS_PASSWORD,
  database: process.env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
});
const ops = process.env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";
(async () => {
  await pool.query(`ALTER TABLE ${ops}.investor_profiles ADD COLUMN IF NOT EXISTS aadhaar_url text`);
  console.log(`aadhaar_url ensured on ${ops}.investor_profiles`);
  await pool.end();
})().catch((e) => { console.error("Migration failed:", e.message); process.exit(1); });
