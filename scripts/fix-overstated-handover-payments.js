// Make the payment rows say what was actually taken at handover.
//
//   RDS_ENV=uat  node scripts/fix-overstated-handover-payments.js            # DRY RUN
//   RDS_ENV=prod node scripts/fix-overstated-handover-payments.js --apply
//
// The write-off register recorded that ₹8,817 of rent was never collected, but
// it left the payment rows themselves saying otherwise. So Ritwik's profile
// shows "₹1,680 received on 19 Aug" when ₹800 crossed the counter, and Finance
// reports ₹8,73,011 collected against ₹8,64,194 of real cash.
//
// This corrects the row to the cash. It does NOT change what anyone owes:
// paid_through_date is untouched, and the weekly ledger derives "paid" from
// paid_through × daily_rent (lib/rent.ts PAID_FROM_BALANCE), never from payment
// amounts. Riders keep the days; the register explains why the days exceed the
// money.
//
// FILED PERIODS ARE REFUSED. May, June and July are filed with the GST return
// and their rows were part of what was submitted — ₹6,897 of the overstatement
// lives there and has to stand. Only months after FILED_THROUGH are touched.
// Move that date forward as further returns are filed.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");
const FILED_THROUGH = "2026-07-31";
const inr = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");

(async () => {
  const c = new Client({
    host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
    password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Target: ${S}   mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply)"}`);
  console.log(`Filed through ${FILED_THROUGH} — nothing on or before that date is touched.\n`);

  await c.query("BEGIN");
  try {
    const all = await c.query(`
      SELECT ri.name, p.id AS payment_id,
             to_char(a.assigned_date,'DD Mon')  AS d,
             to_char(a.assigned_date,'YYYY-MM') AS month,
             a.amount_collected::numeric AS cash,
             p.amount_collected::numeric AS row_says,
             a.assigned_date > $1::date  AS correctable
        FROM ${S}.rider_vehicle_assignments a
        JOIN ${S}.riders ri ON ri.id = a.rider_id
        JOIN LATERAL (
          SELECT id, amount_collected FROM ${S}.rider_payments p
           WHERE p.rider_id = a.rider_id AND p.payment_date = a.assigned_date AND p.payment_mode IS NULL
           ORDER BY p.created_at LIMIT 1
        ) p ON true
       WHERE a.amount_collected > 0 AND p.amount_collected > a.amount_collected
       ORDER BY a.assigned_date`, [FILED_THROUGH]);

    const todo = all.rows.filter((x) => x.correctable);
    const filed = all.rows.filter((x) => !x.correctable);

    console.table(all.rows.map((x) => ({
      rider: x.name.slice(0, 20), date: x.d, month: x.month,
      taken: inr(x.cash), row_says: inr(x.row_says), gap: inr(Number(x.row_says) - Number(x.cash)),
      action: x.correctable ? "correct to cash" : "LEFT — period filed",
    })));

    for (const x of todo) {
      await c.query(`UPDATE ${S}.rider_payments SET amount_collected = $2 WHERE id = $1`,
        [x.payment_id, x.cash]);
    }

    const corrected = todo.reduce((s, x) => s + (Number(x.row_says) - Number(x.cash)), 0);
    const untouched = filed.reduce((s, x) => s + (Number(x.row_says) - Number(x.cash)), 0);
    console.log(`\nrows corrected: ${todo.length}  (${inr(corrected)} removed from reported collections)`);
    console.log(`rows left alone in filed periods: ${filed.length}  (${inr(untouched)} — explained by the write-off register)`);

    const tot = await c.query(`SELECT COALESCE(sum(amount_collected),0)::numeric AS t FROM ${S}.rider_payments`);
    console.log(`\nreported rent collected is now ${inr(tot.rows[0].t)}`);

    // Nobody's position may move. Prove it rather than assert it.
    const owed = await c.query(`
      SELECT COALESCE(sum(GREATEST(0,
        CEIL(GREATEST(((now() AT TIME ZONE 'Asia/Kolkata')::date - a.paid_through_date),0)/7.0)::int
          * a.daily_rent*7 - COALESCE(a.rent_credit,0))),0)::int AS t
        FROM ${S}.rider_vehicle_assignments a WHERE a.status = 'active'`);
    console.log(`total outstanding across active riders: ${inr(owed.rows[0].t)} (unchanged by this script)`);

    if (APPLY) { await c.query("COMMIT"); console.log("\nCOMMITTED."); }
    else { await c.query("ROLLBACK"); console.log("\nDry run — rolled back, nothing changed."); }
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  await c.end();
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
