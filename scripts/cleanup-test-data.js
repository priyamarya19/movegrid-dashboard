// One-off: remove the smoke-test data created while testing the forms — the test
// rider (mobile 9000000001) and the test vehicle (ZZTEST0001). Dry-run by default;
// --apply deletes in one transaction. Intended for UAT.
//   RDS_ENV=uat node scripts/cleanup-test-data.js           # report only
//   RDS_ENV=uat node scripts/cleanup-test-data.js --apply   # delete
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});

const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");
const TEST_MOBILE = "9000000001";
const TEST_EV = "ZZTEST0001";

const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });

(async () => {
  await client.connect();
  console.log(`Target schema: ${S}   mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  const rider = (await client.query(`SELECT id, name, rider_code FROM ${S}.riders WHERE mobile = $1`, [TEST_MOBILE])).rows[0];
  let veh = (await client.query(`SELECT id, ev_number, status FROM ${S}.vehicles WHERE ev_number = $1`, [TEST_EV])).rows[0];

  console.log(rider ? `Rider: ${rider.name} (${rider.rider_code}, ${rider.id})` : `No rider with mobile ${TEST_MOBILE}.`);
  console.log(veh ? `Vehicle: ${veh.ev_number} (${veh.status}, ${veh.id})` : `No vehicle ${TEST_EV}.`);

  // Never delete the test vehicle if it somehow has assignment history.
  if (veh) {
    const inUse = (await client.query(`SELECT 1 FROM ${S}.rider_vehicle_assignments WHERE vehicle_id = $1 LIMIT 1`, [veh.id])).rowCount;
    if (inUse) { console.log(`⚠ ${veh.ev_number} has assignment history — skipping vehicle delete.`); veh = null; }
  }

  if (!rider && !veh) { console.log("\nNothing to clean up."); await client.end(); return; }
  if (!APPLY) { console.log("\n(DRY RUN — re-run with --apply to delete.)"); await client.end(); return; }

  await client.query("BEGIN");
  try {
    if (rider) {
      // Break the assignment self-reference (continuation → parent) before deleting.
      await client.query(`UPDATE ${S}.rider_vehicle_assignments SET continues_from_assignment_id = NULL WHERE rider_id = $1`, [rider.id]);
      for (const t of ["rider_payments", "rent_dues", "rider_penalties", "rent_waiver_requests", "rider_vehicle_assignments"]) {
        const r = await client.query(`DELETE FROM ${S}.${t} WHERE rider_id = $1`, [rider.id]);
        console.log(`  ${t}: -${r.rowCount}`);
      }
      console.log(`  riders: -${(await client.query(`DELETE FROM ${S}.riders WHERE id = $1`, [rider.id])).rowCount}`);
    }
    if (veh) {
      console.log(`  vehicles: -${(await client.query(`DELETE FROM ${S}.vehicles WHERE id = $1`, [veh.id])).rowCount}`);
    }
    await client.query("COMMIT");
    console.log(`\n✓ Test data removed.`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`\n✗ Rolled back — nothing deleted. Error: ${e.message}`);
    process.exit(1);
  }
  await client.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
