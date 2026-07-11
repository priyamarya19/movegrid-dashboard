// Migration: rent waiver approval workflow.
//
// - uat_auth.users / auth.users: can_approve_rent_waivers boolean -- a configurable
//   per-user permission (independent of role), managed via Settings > Users.
// - rent_waiver_requests: created when an issue-swap allotment carries over a
//   non_functional_days credit -- the credit sits 'pending' (full rent still shown
//   owed) until someone with can_approve_rent_waivers approves or rejects it.
//
// Idempotent. Targets the schema in .env.local.
//   node scripts/add-rent-waiver-approval.js
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const authS = isUAT ? "uat_auth" : "auth";
const opsS = isUAT ? "mg_data_uat" : "mg_data";

(async () => {
  await client.connect();

  await client.query(`ALTER TABLE ${authS}.users ADD COLUMN IF NOT EXISTS can_approve_rent_waivers boolean NOT NULL DEFAULT false`);
  console.log(`✓ can_approve_rent_waivers ready on ${authS}.users`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${opsS}.rent_waiver_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id uuid NOT NULL REFERENCES ${opsS}.riders(id),
      assignment_id uuid NOT NULL REFERENCES ${opsS}.rider_vehicle_assignments(id),
      non_functional_days integer NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      requested_by text,
      requested_at timestamptz NOT NULL DEFAULT now(),
      approved_by text,
      approved_at timestamptz
    )
  `);
  console.log(`✓ ${opsS}.rent_waiver_requests ready`);
  console.log(`No one has can_approve_rent_waivers yet -- grant it via Settings > Users, or tell me who to grant it to.`);

  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
