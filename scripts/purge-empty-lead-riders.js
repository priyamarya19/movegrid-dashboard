// Remove the rider shells that migration 024's trigger created from leads.
//
//   node scripts/purge-empty-lead-riders.js              # DRY RUN (default)
//   RDS_ENV=prod node scripts/purge-empty-lead-riders.js --apply
//
// Only deletes a rider that is genuinely untouched: created by the lead trigger
// or its backfill, still pending, and with no assignment, no payment, no KYC
// submission, and none of the fields ops would have filled in. A lead-created
// rider that someone has since completed — Yogesh Nagar is the live example —
// is left alone.
//
// Every deleted row is written to a JSON file first, so the whole set can be
// restored if this turns out to be wrong.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});

const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");

// The definition of "untouched". Deliberately strict: any sign of a human
// having done something with this rider disqualifies them from deletion.
const EMPTY = `
  r.created_by IN ('lead-auto','lead-backfill')
  AND r.status = 'pending'
  AND NOT EXISTS (SELECT 1 FROM ${S}.rider_vehicle_assignments a WHERE a.rider_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM ${S}.rider_payments p WHERE p.rider_id = r.id)
  AND r.kyc_submitted_at IS NULL
  AND r.current_address IS NULL AND r.permanent_address IS NULL
  AND r.bank IS NULL AND r.account_number IS NULL AND r.ifsc IS NULL
  AND r.assigned_hub_id IS NULL AND r.dl_number IS NULL
  AND r.aadhaar IS NULL AND r.pan IS NULL
  AND r.aadhaar_front_url IS NULL AND r.pan_image_url IS NULL
  AND r.family_ref_name IS NULL AND r.local_ref_name IS NULL
  AND r.onboarding_fee IS NULL AND r.security_deposit IS NULL`;

(async () => {
  const c = new Client({
    host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
    password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Target: ${S}   mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply to delete)"}\n`);

  const doomed = (await c.query(`SELECT * FROM ${S}.riders r WHERE ${EMPTY} ORDER BY r.rider_code`)).rows;
  const kept = (await c.query(
    `SELECT r.name, r.rider_code FROM ${S}.riders r
     WHERE r.created_by IN ('lead-auto','lead-backfill') AND NOT (${EMPTY})`
  )).rows;

  console.log(`lead-created riders to DELETE : ${doomed.length}`);
  console.log(`lead-created riders KEPT      : ${kept.length}${kept.length ? "  → " + kept.map(k => `${k.name} (${k.rider_code})`).join(", ") : ""}`);

  if (!doomed.length) { console.log("\nNothing to do."); await c.end(); return; }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const backup = path.join(process.env.HOME, "Desktop", "MOVEGRID-reports", `deleted_lead_riders_${S}_${stamp}.json`);

  if (!APPLY) {
    console.log(`\nWould write a restorable copy to:\n  ${backup}`);
    console.log("\nSample of what would go:");
    console.table(doomed.slice(0, 5).map(r => ({ code: r.rider_code, name: r.name, mobile: r.mobile, created_by: r.created_by })));
    console.log("\nDry run only — nothing deleted.");
    await c.end();
    return;
  }

  fs.writeFileSync(backup, JSON.stringify(doomed, null, 2));
  console.log(`\nBackup written: ${backup}  (${doomed.length} rows)`);

  try {
    await c.query("BEGIN");
    const ids = doomed.map(r => r.id);
    const del = await c.query(`DELETE FROM ${S}.riders WHERE id = ANY($1::uuid[])`, [ids]);
    await c.query("COMMIT");
    console.log(`Deleted: ${del.rowCount} rider(s)`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }

  const left = (await c.query(`SELECT count(*)::int n FROM ${S}.riders`)).rows[0].n;
  console.log(`riders remaining in ${S}: ${left}`);
  await c.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
