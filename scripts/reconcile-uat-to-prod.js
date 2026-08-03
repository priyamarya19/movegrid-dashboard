// One-off: reconcile field activity that landed in UAT while the prod app was
// misdirected (EXPO_PUBLIC_API_URL fell back to dash-uat) into prod. Prod received
// ZERO field writes in that window, so UAT is the source of truth for these riders'
// recent rent payments + returns. Syncs ONLY the diverged rows, and only ever moves
// prod FORWARD (never backward). Dry-run by default; --apply runs in one transaction.
//
//   node scripts/reconcile-uat-to-prod.js           # report the diff, change nothing
//   node scripts/reconcile-uat-to-prod.js --apply    # apply to prod
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const APPLY = process.argv.includes("--apply");
const c = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const q = (s, p) => c.query(s, p);

(async () => {
  await c.connect();
  console.log(`Reconcile mg_data_uat -> mg_data   mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  // Diverged assignments: UAT advanced the rent (paid_through) or marked a return,
  // and prod is behind. Forward-only: only a later paid_through, or a UAT return
  // against a prod-active row — never move prod backward.
  const div = (await q(`
    SELECT ua.id, ua.rider_id, ua.vehicle_id, ru.name,
      to_char(ua.paid_through_date,'YYYY-MM-DD') uat_ptd, to_char(pa.paid_through_date,'YYYY-MM-DD') prod_ptd,
      ua.status uat_st, pa.status prod_st, to_char(ua.returned_date,'YYYY-MM-DD') uat_ret
    FROM mg_data_uat.rider_vehicle_assignments ua
    JOIN mg_data_uat.riders ru ON ru.id = ua.rider_id
    JOIN mg_data.rider_vehicle_assignments pa ON pa.id = ua.id
    WHERE ua.paid_through_date > pa.paid_through_date
       OR (ua.status = 'returned' AND pa.status = 'active')
    ORDER BY ru.name`)).rows;

  console.log(`Assignments to sync: ${div.length}`);
  div.forEach(x => console.log(`  ${x.name}: paid_through ${x.prod_ptd} -> ${x.uat_ptd}` + (x.uat_st === "returned" && x.prod_st === "active" ? `, RETURN (${x.uat_ret})` : "")));

  const asgIds = div.map(x => x.id);
  const riderIds = [...new Set(div.map(x => x.rider_id))];
  const vehIds = [...new Set(div.filter(x => x.uat_st === "returned").map(x => x.vehicle_id))];

  const missPay = (await q(`SELECT count(*) n FROM mg_data_uat.rider_payments up WHERE up.rider_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM mg_data.rider_payments pp WHERE pp.id = up.id)`, [riderIds])).rows[0].n;
  console.log(`Payment rows to copy: ${missPay}`);
  console.log(`Riders affected: ${riderIds.length} | vehicles freed by returns: ${vehIds.length}`);

  if (!div.length) { console.log("\nNothing to reconcile."); await c.end(); return; }
  if (!APPLY) { console.log("\n(DRY RUN — re-run with --apply to write to prod.)"); await c.end(); return; }

  await q("BEGIN");
  try {
    // 1. Assignments: adopt UAT's paid_through / status / returned_date.
    await q(`UPDATE mg_data.rider_vehicle_assignments pa
             SET paid_through_date = ua.paid_through_date, status = ua.status, returned_date = ua.returned_date
             FROM mg_data_uat.rider_vehicle_assignments ua
             WHERE pa.id = ua.id AND pa.id = ANY($1)`, [asgIds]);
    // 2. Riders: adopt UAT status (returned riders -> inactive).
    await q(`UPDATE mg_data.riders pr SET status = ur.status
             FROM mg_data_uat.riders ur WHERE pr.id = ur.id AND pr.id = ANY($1) AND pr.status IS DISTINCT FROM ur.status`, [riderIds]);
    // 3. Vehicles freed by a return: adopt UAT status.
    if (vehIds.length) {
      await q(`UPDATE mg_data.vehicles pv SET status = uv.status
               FROM mg_data_uat.vehicles uv WHERE pv.id = uv.id AND pv.id = ANY($1) AND pv.status IS DISTINCT FROM uv.status`, [vehIds]);
    }
    // 4. Copy the missing payment rows (shared columns, by id, only affected riders).
    const cols = (await q(`SELECT a.column_name FROM information_schema.columns a
      JOIN information_schema.columns b ON b.table_schema='mg_data' AND b.table_name='rider_payments' AND b.column_name=a.column_name
      WHERE a.table_schema='mg_data_uat' AND a.table_name='rider_payments' ORDER BY a.ordinal_position`)).rows.map(r => `"${r.column_name}"`).join(", ");
    const pres = await q(`INSERT INTO mg_data.rider_payments (${cols})
      SELECT ${cols} FROM mg_data_uat.rider_payments up
      WHERE up.rider_id = ANY($1) AND NOT EXISTS (SELECT 1 FROM mg_data.rider_payments pp WHERE pp.id = up.id)`, [riderIds]);

    await q("COMMIT");
    console.log(`\n✓ Reconciled ${div.length} assignments, ${riderIds.length} riders, ${vehIds.length} vehicles, +${pres.rowCount} payments to prod.`);
  } catch (e) {
    await q("ROLLBACK");
    console.error(`\n✗ Rolled back — nothing changed. Error: ${e.message}`);
    process.exit(1);
  }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
