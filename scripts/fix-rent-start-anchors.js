// Repair the rows drawn from the wrong anchor.
//
//   RDS_ENV=uat  node scripts/fix-rent-start-anchors.js            # DRY RUN
//   RDS_ENV=prod node scripts/fix-rent-start-anchors.js --apply
//
// The 3 PM rule made a morning handover chargeable from the handover day
// itself, and moved paid_through_date accordingly — but three places kept
// anchoring on "the day after handover":
//
//   * the handover payment's rental_period_start/end
//   * the weekly rent_dues rows
//   * the live week synthesis (code only, nothing stored)
//
// So Gaurav and Rohit's ₹1,820 on 3 Sep bought 3–9 Sep while the row said
// 4–10 Sep, and a fully paid week showed as "PARTIAL ₹1,560 / ₹1,820" beside
// "Outstanding ₹0 — paid up".
//
// Only allotments whose rent starts ON the handover day are affected. For every
// other row rent_start_date is assigned_date + 1, where old and new anchors
// agree, so they are not touched. That is why this finds three rows, not 137.
//
// Moves no money: amounts, paid_through_date and rent_credit are all untouched.
// It corrects the DATES that label them.
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
    // ── 1. the handover payment rows ───────────────────────────────────────
    const pay = await c.query(`
      SELECT ri.name, p.id AS payment_id, p.amount_collected::numeric AS amt, a.daily_rent::numeric AS rate,
             to_char(p.rental_period_start,'DD Mon') AS old_from,
             to_char(p.rental_period_end,'DD Mon')   AS old_to,
             to_char(a.rent_start_date,'DD Mon')     AS new_from,
             to_char(a.rent_start_date + (FLOOR(p.amount_collected / NULLIF(a.daily_rent,0))::int - 1), 'DD Mon') AS new_to
        FROM ${S}.rider_vehicle_assignments a
        JOIN ${S}.riders ri ON ri.id = a.rider_id
        JOIN ${S}.rider_payments p
          ON p.rider_id = a.rider_id AND p.payment_date = a.assigned_date AND p.payment_mode IS NULL
       WHERE a.rent_start_date = a.assigned_date
         AND p.rental_period_start <> a.rent_start_date
       ORDER BY a.assigned_date`);

    if (pay.rows.length) {
      console.log("Handover payments labelled from the wrong day:");
      console.table(pay.rows.map((x) => ({
        rider: x.name.slice(0, 20), amount: "₹" + Number(x.amt).toLocaleString("en-IN"),
        period: `${x.old_from} – ${x.old_to}  →  ${x.new_from} – ${x.new_to}`,
      })));
      await c.query(`
        UPDATE ${S}.rider_payments p
           SET rental_period_start = a.rent_start_date,
               rental_period_end   = a.rent_start_date
                                     + (FLOOR(p.amount_collected / NULLIF(a.daily_rent,0))::int - 1)
          FROM ${S}.rider_vehicle_assignments a
         WHERE p.rider_id = a.rider_id AND p.payment_date = a.assigned_date AND p.payment_mode IS NULL
           AND a.rent_start_date = a.assigned_date
           AND p.rental_period_start <> a.rent_start_date`);
    } else {
      console.log("Handover payment periods: nothing to correct.");
    }

    // ── 2. the stored weekly dues ──────────────────────────────────────────
    const dues = await c.query(`
      SELECT ri.name, d.id, d.week_no,
             to_char(d.period_start,'DD Mon') AS old_from, to_char(d.period_end,'DD Mon') AS old_to,
             to_char(d.period_start - 1,'DD Mon') AS new_from, to_char(d.period_end - 1,'DD Mon') AS new_to
        FROM ${S}.rent_dues d
        JOIN ${S}.rider_vehicle_assignments a ON a.id = d.assignment_id
        JOIN ${S}.riders ri ON ri.id = d.rider_id
       WHERE a.rent_start_date = a.assigned_date
         AND a.continues_from_assignment_id IS NULL
         AND d.period_start > a.rent_start_date
         -- Only the run that began a day late; a continuation takes its cadence
         -- from the previous assignment and is right as it stands.
         AND d.period_start = a.assigned_date + 1 + (d.week_no - 1) * 7
       ORDER BY ri.name, d.week_no`);

    if (dues.rows.length) {
      console.log("\nWeekly dues drawn a day late:");
      console.table(dues.rows.map((x) => ({
        rider: x.name.slice(0, 20), week: x.week_no,
        period: `${x.old_from} – ${x.old_to}  →  ${x.new_from} – ${x.new_to}`,
      })));
      await c.query(
        `UPDATE ${S}.rent_dues
            SET period_start = period_start - 1, period_end = period_end - 1, due_date = due_date - 1
          WHERE id = ANY($1::uuid[])`,
        [dues.rows.map((x) => x.id)]
      );
    } else {
      console.log("\nWeekly dues: nothing to correct.");
    }

    // Nothing about the money may have moved.
    const money = await c.query(`
      SELECT COALESCE(sum(amount_collected),0)::int AS collected FROM ${S}.rider_payments`);
    console.log(`\ntotal rent collected: ₹${Number(money.rows[0].collected).toLocaleString("en-IN")} (untouched by this script)`);

    if (APPLY) { await c.query("COMMIT"); console.log("\nCOMMITTED."); }
    else { await c.query("ROLLBACK"); console.log("\nDry run — rolled back, nothing changed."); }
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  await c.end();
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
