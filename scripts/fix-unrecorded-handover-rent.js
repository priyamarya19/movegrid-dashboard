// Allotments where cash was taken at handover but no rent was recorded.
//
//   RDS_ENV=uat  node scripts/fix-unrecorded-handover-rent.js            # DRY RUN
//   RDS_ENV=prod node scripts/fix-unrecorded-handover-rent.js --apply
//
// The mirror image of the phantom-rent bug. That one invented rent nobody paid;
// this one records none at all, so a rider who handed over real money looks
// overdue the next morning.
//
// Cause: "of which, rent" is stated by ops now, and if they leave it at ₹0 the
// system faithfully believes them. Golu kumar paid ₹3,180 on 29 Aug — ₹1,500
// onboarding fee plus ₹1,680 rent, exactly seven days — and bought zero days.
//
// Found, not listed: any allotment with real cash and no rent row against it.
// The rent is derived as cash − fee − deposit, and a case is only corrected
// when that lands on a WHOLE number of days at the rider's rate. Anything that
// does not divide cleanly is a judgement call and gets printed for a human
// rather than guessed at.
//
// Never touches a filed period: August onwards only (July's GST is filed).
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");
const FILED_THROUGH = "2026-07-31";   // July is filed — nothing on or before this moves.
const inr = (n) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");

(async () => {
  const c = new Client({
    host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
    password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Target: ${S}   mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply)"}\n`);

  await c.query("BEGIN");
  try {
    const found = await c.query(`
      SELECT a.id, a.rider_id, a.vehicle_id, ri.name,
             to_char(a.assigned_date,'YYYY-MM-DD') AS on_date,
             to_char(a.assigned_date,'DD Mon')     AS pretty,
             a.amount_collected::numeric AS cash,
             a.daily_rent::numeric       AS rate,
             COALESCE(ri.onboarding_fee,0)::numeric   AS fee,
             COALESCE(ri.security_deposit,0)::numeric AS dep,
             to_char(COALESCE(a.rent_start_date, a.assigned_date + 1),'YYYY-MM-DD') AS rent_start
        FROM ${S}.rider_vehicle_assignments a
        JOIN ${S}.riders ri ON ri.id = a.rider_id
       WHERE a.amount_collected > 100
         AND a.assigned_date > $1::date
         AND NOT EXISTS (
           SELECT 1 FROM ${S}.rider_payments p
            WHERE p.rider_id = a.rider_id AND p.payment_date = a.assigned_date)
       ORDER BY a.assigned_date`, [FILED_THROUGH]);

    const clean = [], unclear = [];
    for (const x of found.rows) {
      const rent = Number(x.cash) - Number(x.fee) - Number(x.dep);
      const days = rent / Number(x.rate);
      // Only act where the arithmetic is unambiguous.
      (rent > 0 && Number.isInteger(days) ? clean : unclear).push({ ...x, rent, days });
    }

    if (unclear.length) {
      console.log("NOT TOUCHED — the rent does not divide into whole days, so someone must decide:");
      console.table(unclear.map((x) => ({
        rider: x.name.slice(0, 20), date: x.pretty, cash: inr(x.cash),
        fee: inr(x.fee), deposit: inr(x.dep), implied_rent: inr(x.rent),
        at_rate: inr(x.rate), days: (x.rent / Number(x.rate)).toFixed(2),
      })));
      console.log();
    }

    if (!clean.length) {
      console.log("Nothing to correct.");
      await c.query("ROLLBACK");
      await c.end();
      return;
    }

    const before = [];
    for (const x of clean) {
      const b = await c.query(
        `SELECT to_char(paid_through_date,'DD Mon') pt,
                GREATEST(0, CEIL(GREATEST(((now() AT TIME ZONE 'Asia/Kolkata')::date - paid_through_date),0)/7.0)::int
                  * daily_rent*7 - COALESCE(rent_credit,0))::int AS owed
           FROM ${S}.rider_vehicle_assignments WHERE id = $1`, [x.id]);
      before.push(b.rows[0]);

      // The rent that was actually handed over, recorded the way ops entering it
      // would have. payment_mode stays NULL to match the other handover rows.
      await c.query(
        `INSERT INTO ${S}.rider_payments
           (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end)
         VALUES ($1,$2,$3,$4::date,$5::date,$5::date + ($6::int - 1))`,
        [x.rider_id, x.vehicle_id, x.rent, x.on_date, x.rent_start, x.days]
      );

      // Paid through the last day the money covers: the day before rent starts,
      // plus the days bought. Same arithmetic the allotment route uses.
      await c.query(
        `UPDATE ${S}.rider_vehicle_assignments
            SET paid_through_date = $2::date - 1 + $3::int
          WHERE id = $1`,
        [x.id, x.rent_start, x.days]
      );
    }

    const after = [];
    for (const x of clean) {
      const a = await c.query(
        `SELECT to_char(paid_through_date,'DD Mon') pt,
                GREATEST(0, CEIL(GREATEST(((now() AT TIME ZONE 'Asia/Kolkata')::date - paid_through_date),0)/7.0)::int
                  * daily_rent*7 - COALESCE(rent_credit,0))::int AS owed
           FROM ${S}.rider_vehicle_assignments WHERE id = $1`, [x.id]);
      after.push(a.rows[0]);
    }

    console.log("CORRECTED:");
    console.table(clean.map((x, i) => ({
      rider: x.name.slice(0, 20), date: x.pretty, cash: inr(x.cash),
      rent_recorded: inr(x.rent), days: x.days,
      paid_through: `${before[i].pt} → ${after[i].pt}`,
      owed: `${inr(before[i].owed)} → ${inr(after[i].owed)}`,
    })));

    if (APPLY) { await c.query("COMMIT"); console.log("\nCOMMITTED."); }
    else { await c.query("ROLLBACK"); console.log("\nDry run — rolled back, nothing changed."); }
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  await c.end();
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
