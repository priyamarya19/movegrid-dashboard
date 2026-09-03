// Bring stored rent-start dates into line with the current cut-off.
//
//   RDS_ENV=prod node scripts/fix-rent-start-cutoff.js            # DRY RUN
//   RDS_ENV=prod node scripts/fix-rent-start-cutoff.js --apply
//
// The cut-off moved from 3 PM to 2 PM on 3 Sep 2026: Gaurav and Rohit were
// handed scooters at 14:04 and 14:50 and charged for that day, which is not a
// day a rider can make pay.
//
// Rather than naming those two, this finds every allotment whose stored
// rent_start_date disagrees with what the CURRENT rule produces from its own
// handover timestamp — so the same script serves the next time the boundary
// moves, and it cannot quietly miss someone.
//
// Moving rent start moves the days that were paid for with it: seven days
// bought is still seven days, counted from one day later. Nobody gains or
// loses coverage; the week simply sits where the rule says it should.
//
// An admin-approved override is left alone. That was somebody's deliberate
// decision about a particular rider, and a boundary change is no reason to
// overwrite it.
//
// ONLY ALLOTMENTS MADE UNDER THE RULE. Migration 030 backfilled handed_over_at
// from created_at on all 130 pre-existing rows — that timestamp says when ops
// typed the allotment in, not when the rider collected. Reading it as a
// handover time and applying the cut-off to it rewrites the ledger of riders
// who were never subject to the rule at all: unrestricted, this touched 18
// riders including one owing ₹11,760. RULE_LIVE_FROM is the boundary, and it
// is a date rather than a clever heuristic on purpose.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { RENT_START_CUTOFF_HOUR } = require("../lib/rentStartCutoff");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");
// The day the cut-off rule reached production. Nothing before this was decided
// by it, so nothing before this may be re-decided by it.
const RULE_LIVE_FROM = "2026-08-30";

// What the rule says, from an allotment's own handover timestamp. Written once
// and reused for both the report and the update so they cannot drift apart.
const SHOULD_START = `
  CASE
    -- A back-dated allotment tells us nothing about when that rider actually
    -- collected, so the handover day stays free.
    WHEN (a.handed_over_at AT TIME ZONE 'Asia/Kolkata')::date <> a.assigned_date
      THEN a.assigned_date + 1
    WHEN EXTRACT(HOUR FROM a.handed_over_at AT TIME ZONE 'Asia/Kolkata') < $1
      THEN a.assigned_date
    ELSE a.assigned_date + 1
  END`;

(async () => {
  const c = new Client({
    host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
    password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Target: ${S}   cut-off: ${RENT_START_CUTOFF_HOUR}:00 IST   mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply)"}`);
  console.log(`Only allotments from ${RULE_LIVE_FROM} — before that the rule did not exist.\n`);

  await c.query("BEGIN");
  try {
    const rows = (await c.query(`
      SELECT ri.name, v.ev_number, a.id,
             to_char(a.assigned_date,'DD Mon') AS allotted,
             to_char(a.handed_over_at AT TIME ZONE 'Asia/Kolkata','HH24:MI') AS handed_at,
             to_char(a.rent_start_date,'DD Mon')   AS old_start,
             to_char(a.paid_through_date,'DD Mon') AS old_thru,
             to_char((${SHOULD_START}),'DD Mon')   AS new_start,
             to_char((${SHOULD_START}) + FLOOR(a.rent_collected / NULLIF(a.daily_rent,0))::int - 1,'DD Mon') AS new_thru
        FROM ${S}.rider_vehicle_assignments a
        JOIN ${S}.riders ri ON ri.id = a.rider_id
        LEFT JOIN ${S}.vehicles v ON v.id = a.vehicle_id
       WHERE a.handed_over_at IS NOT NULL
         AND a.assigned_date >= $2::date
         AND a.rent_start_overridden = false
         AND a.rent_collected IS NOT NULL
         AND (${SHOULD_START}) <> a.rent_start_date
       ORDER BY a.assigned_date`, [RENT_START_CUTOFF_HOUR, RULE_LIVE_FROM])).rows;

    if (!rows.length) {
      console.log(`Every stored rent start already matches the ${RENT_START_CUTOFF_HOUR}:00 cut-off. Nothing to do.`);
      await c.query("ROLLBACK");
      await c.end();
      return;
    }

    console.table(rows.map((r) => ({
      rider: r.name.slice(0, 20), scooter: r.ev_number, allotted: r.allotted, handed_at: r.handed_at,
      rent_starts: `${r.old_start} → ${r.new_start}`,
      paid_through: `${r.old_thru} → ${r.new_thru}`,
    })));

    const ids = rows.map((r) => r.id);

    await c.query(`
      UPDATE ${S}.rider_vehicle_assignments a
         SET rent_start_date   = (${SHOULD_START}),
             -- The days they paid for travel with the start date.
             paid_through_date = (${SHOULD_START})
                                 + FLOOR(a.rent_collected / NULLIF(a.daily_rent,0))::int - 1
       WHERE a.id = ANY($2::uuid[])`, [RENT_START_CUTOFF_HOUR, ids]);

    // The handover payment describes the days the money bought — keep it in step.
    await c.query(`
      UPDATE ${S}.rider_payments p
         SET rental_period_start = a.rent_start_date,
             rental_period_end   = a.rent_start_date
                                   + FLOOR(p.amount_collected / NULLIF(a.daily_rent,0))::int - 1
        FROM ${S}.rider_vehicle_assignments a
       WHERE a.id = ANY($1::uuid[])
         AND p.rider_id = a.rider_id AND p.payment_date = a.assigned_date AND p.payment_mode IS NULL`,
      [ids]);

    const after = (await c.query(`
      SELECT ri.name,
             to_char(a.rent_start_date,'DD Mon')   AS rs,
             to_char(a.paid_through_date,'DD Mon') AS pt,
             to_char(p.rental_period_start,'DD Mon') AS pf,
             to_char(p.rental_period_end,'DD Mon')   AS pe,
             GREATEST(0, CEIL(GREATEST(((now() AT TIME ZONE 'Asia/Kolkata')::date - a.paid_through_date),0)/7.0)::int
               * a.daily_rent*7 - COALESCE(a.rent_credit,0))::int AS owed
        FROM ${S}.rider_vehicle_assignments a
        JOIN ${S}.riders ri ON ri.id = a.rider_id
        LEFT JOIN ${S}.rider_payments p
          ON p.rider_id = a.rider_id AND p.payment_date = a.assigned_date AND p.payment_mode IS NULL
       WHERE a.id = ANY($1::uuid[])`, [ids])).rows;

    console.log("\nafter:");
    after.forEach((x) =>
      console.log(`  ${x.name.padEnd(18)} rent from ${x.rs} · paid through ${x.pt} · payment says ${x.pf}–${x.pe} · owes ₹${x.owed}`));

    const money = await c.query(`SELECT COALESCE(sum(amount_collected),0)::int AS t FROM ${S}.rider_payments`);
    console.log(`\ntotal rent collected: ₹${Number(money.rows[0].t).toLocaleString("en-IN")} (untouched)`);

    if (APPLY) { await c.query("COMMIT"); console.log("\nCOMMITTED."); }
    else { await c.query("ROLLBACK"); console.log("\nDry run — rolled back, nothing changed."); }
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  await c.end();
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
