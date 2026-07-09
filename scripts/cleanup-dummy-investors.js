// One-time cleanup: remove dummy/test investor data from UAT so it never gets
// carried into production. Keeps the investor@movegrid.in QA login (clears its
// fake profile/vehicles/payouts); fully removes the other two fake investors
// (login + profile). Vehicles are unmapped (investor_id = NULL), not deleted —
// they're real fleet vehicles that were just fake-assigned.
//   node scripts/cleanup-dummy-investors.js
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });

if (env.RDS_ENV !== "uat") {
  console.error("❌ Refusing to run: RDS_ENV is not 'uat'. This script only targets UAT test data.");
  process.exit(1);
}
const S = "mg_data_uat";
const AUTH = "uat_auth";

const PROFILE_IDS = [
  "22d9c1ca-71ec-4bf5-acf6-6841a86c0399", // Test Investor (keep login)
  "7104019c-e01f-42f3-b8ac-98bb13603744", // Rahul Khanna
  "f892cc08-1de1-4ca6-838f-af87cdd8d8b9", // Ravi Gupta
];
const USER_IDS_TO_DELETE = [
  "3d82c5fd-e987-4fca-9496-8f25ccf74355", // Rahul Khanna
  "b06fb0e8-056c-4bf3-8ca1-7831a32342e5", // Ravi Gupta
];

(async () => {
  await client.connect();

  const vehicles = await client.query(
    `UPDATE ${S}.vehicles SET investor_id = NULL WHERE investor_id = ANY($1)`,
    [PROFILE_IDS]
  );
  console.log(`✓ Unmapped ${vehicles.rowCount} vehicles`);

  const payouts = await client.query(
    `DELETE FROM ${S}.investor_payouts WHERE investor_id = ANY($1)`,
    [PROFILE_IDS]
  );
  console.log(`✓ Deleted ${payouts.rowCount} investor_payouts rows`);

  const profiles = await client.query(
    `DELETE FROM ${S}.investor_profiles WHERE id = ANY($1)`,
    [PROFILE_IDS]
  );
  console.log(`✓ Deleted ${profiles.rowCount} investor_profiles rows`);

  const users = await client.query(
    `DELETE FROM ${AUTH}.users WHERE id = ANY($1)`,
    [USER_IDS_TO_DELETE]
  );
  console.log(`✓ Deleted ${users.rowCount} login accounts (kept investor@movegrid.in)`);

  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
