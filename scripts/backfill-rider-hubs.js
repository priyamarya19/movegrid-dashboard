// Give every rider holding a scooter the hub that scooter is parked at.
//
//   RDS_ENV=uat  node scripts/backfill-rider-hubs.js            # DRY RUN
//   RDS_ENV=uat  node scripts/backfill-rider-hubs.js --apply
//   RDS_ENV=prod node scripts/backfill-rider-hubs.js --apply
//
// Why this exists: the allotment route never wrote riders.assigned_hub_id, and
// only wrote the assignment's hub_id when the client happened to send one. So
// riders could hold one of our scooters while their record said they belonged
// to no hub at all.
//
// That was not cosmetic. The rider app sends anyone without a hub to the city
// screen, and the city screen refused anyone holding a scooter — telling them
// it was at "another hub" that does not exist, with no way forward and no way
// back. Fifteen riders in production could not get past it.
//
// The hub is taken from the VEHICLE, which is the physical truth: a scooter
// sits at a hub whatever the paperwork says. Riders whose vehicle has no hub
// either are skipped and listed — there is nothing to infer from, and guessing
// at where someone's scooter is would be worse than leaving it blank.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");

(async () => {
  const c = new Client({
    host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
    password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Target: ${S}   mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply)"}\n`);

  await c.query("BEGIN");
  try {
    // Who is affected, and what we would give them.
    const affected = await c.query(`
      SELECT r.id, r.name, r.mobile, v.ev_number, v.hub_id, h.hub_name,
             r.assigned_hub_id IS NULL AS rider_hub_missing,
             a.hub_id IS NULL AS assignment_hub_missing
        FROM ${S}.riders r
        JOIN ${S}.rider_vehicle_assignments a ON a.rider_id = r.id AND a.status = 'active'
        JOIN ${S}.vehicles v ON v.id = a.vehicle_id
        LEFT JOIN ${S}.hubs h ON h.id = v.hub_id
       WHERE r.assigned_hub_id IS NULL OR a.hub_id IS NULL
       ORDER BY r.name`);

    const fixable = affected.rows.filter((x) => x.hub_id);
    const stuck = affected.rows.filter((x) => !x.hub_id);

    console.table(fixable.map((x) => ({
      rider: x.name, mobile: x.mobile, scooter: x.ev_number, hub: x.hub_name,
      rider_row: x.rider_hub_missing ? "was blank" : "ok",
      assignment_row: x.assignment_hub_missing ? "was blank" : "ok",
    })));
    if (stuck.length) {
      console.log("\nSKIPPED — their vehicle has no hub either, so there is nothing to copy:");
      console.table(stuck.map((x) => ({ rider: x.name, scooter: x.ev_number })));
    }

    // The rider's hub, from the scooter they are holding.
    const r1 = await c.query(`
      UPDATE ${S}.riders r
         SET assigned_hub_id = v.hub_id
        FROM ${S}.rider_vehicle_assignments a
        JOIN ${S}.vehicles v ON v.id = a.vehicle_id
       WHERE a.rider_id = r.id AND a.status = 'active'
         AND r.assigned_hub_id IS NULL AND v.hub_id IS NOT NULL`);

    // The assignment's hub, same source. Hub-scoped reports read this column,
    // so a blank one quietly drops the rider out of a hub's numbers.
    const r2 = await c.query(`
      UPDATE ${S}.rider_vehicle_assignments a
         SET hub_id = v.hub_id
        FROM ${S}.vehicles v
       WHERE v.id = a.vehicle_id AND a.status = 'active'
         AND a.hub_id IS NULL AND v.hub_id IS NOT NULL`);

    console.log(`\nriders given a hub:      ${r1.rowCount}`);
    console.log(`assignments given a hub: ${r2.rowCount}`);

    const left = await c.query(`
      SELECT count(*)::int n FROM ${S}.riders r
       JOIN ${S}.rider_vehicle_assignments a ON a.rider_id = r.id AND a.status = 'active'
       WHERE r.assigned_hub_id IS NULL`);
    console.log(`still with a scooter and no hub: ${left.rows[0].n}`);

    if (APPLY) { await c.query("COMMIT"); console.log("\nCOMMITTED."); }
    else { await c.query("ROLLBACK"); console.log("\nDry run — rolled back, nothing changed."); }
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  await c.end();
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
