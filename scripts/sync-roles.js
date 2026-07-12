// Sync auth role definitions UAT -> prod. The go-live data copy excluded the whole
// `auth` schema (to keep prod's own admin login), but `auth.roles` is reference data
// — the set of valid role names the app validates against. Prod only had the role(s)
// its admin needed, so creating an ops_manager / hub_incharge / investor user failed
// with "Invalid role". This copies missing role rows by name (a lookup table, not
// user PII). Prod's existing roles are left untouched.
//
//   node scripts/sync-roles.js          # DRY RUN: show both role sets + the gap
//   node scripts/sync-roles.js --apply  # insert the missing roles into auth.roles
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});

const APPLY = process.argv.includes("--apply");
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });

(async () => {
  await client.connect();
  const uat = (await client.query(`SELECT name FROM uat_auth.roles ORDER BY name`)).rows.map((r) => r.name);
  const prod = (await client.query(`SELECT name FROM auth.roles ORDER BY name`)).rows.map((r) => r.name);
  console.log("uat_auth.roles :", uat.join(", ") || "(none)");
  console.log("auth.roles     :", prod.join(", ") || "(none)");
  const missing = uat.filter((n) => !prod.includes(n));
  console.log("missing in prod:", missing.join(", ") || "(none)");

  if (!missing.length) { console.log("\n✓ Nothing to do — prod already has every role."); await client.end(); return; }
  if (!APPLY) { console.log(`\n(DRY RUN — re-run with --apply to insert the ${missing.length} missing role(s).)`); await client.end(); return; }

  // Insert missing rows only (by name), using the columns both tables share.
  const cols = (await client.query(`
    SELECT a.column_name FROM information_schema.columns a
    JOIN information_schema.columns b ON b.table_schema='auth' AND b.table_name='roles' AND b.column_name=a.column_name
    WHERE a.table_schema='uat_auth' AND a.table_name='roles' ORDER BY a.ordinal_position`)).rows.map((r) => `"${r.column_name}"`).join(", ");
  const res = await client.query(`INSERT INTO auth.roles (${cols}) SELECT ${cols} FROM uat_auth.roles WHERE name NOT IN (SELECT name FROM auth.roles)`);
  console.log(`\n✓ Inserted ${res.rowCount} role(s) into prod auth.roles.`);
  await client.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
