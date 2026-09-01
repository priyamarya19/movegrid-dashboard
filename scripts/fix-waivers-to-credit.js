// Turn already-approved waivers from free DAYS into rupee CREDIT.
//
//   RDS_ENV=uat  node scripts/fix-waivers-to-credit.js            # DRY RUN
//   RDS_ENV=prod node scripts/fix-waivers-to-credit.js --apply
//
// Approving a waiver used to push paid_through_date forward by the waived days.
// That handed the rider the days as coverage AND shifted their rent cycle with
// it: two waived days meant their collection day fell two days later, for ever,
// and again on every later waiver. Shashank's had drifted eleven days.
//
// Ops' rule (Priyam, 1 Sep 2026): the rent week never moves. Week 1–7 stays
// 1–7, the next is still 8–14; the rider simply hands over less cash for the
// week their vehicle was down.
//
// So for each assignment carrying approved waivers: take the days back off the
// date, and put their value on as rent_credit. Rupee for rupee that is neutral
// — the same money, described correctly. What does change is the headline
// outstanding, because that rounds UP to whole started weeks: taking days off
// the date can move a rider out of a week they had been pushed into. Measured
// on 1 Sep it made six live riders owe ₹2,740 LESS between them and nobody
// worse off, which is the point — they were being billed for a drift we caused.
//
// Idempotent: an assignment already corrected is skipped (waiver_credited).
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");
const inr = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");

(async () => {
  const c = new Client({
    host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
    password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Target: ${S}   mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply)"}\n`);

  await c.query("BEGIN");
  try {
    // A marker column, so re-running cannot correct the same assignment twice.
    await c.query(`ALTER TABLE ${S}.rent_waiver_requests
                     ADD COLUMN IF NOT EXISTS credited_not_dated boolean NOT NULL DEFAULT false`);

    const rows = (await c.query(`
      SELECT ri.name, a.id AS assignment_id, a.status,
             SUM(w.non_functional_days)::numeric AS waived_days,
             a.daily_rent::numeric               AS rate,
             COALESCE(a.rent_credit,0)::numeric  AS credit,
             to_char(a.paid_through_date,'YYYY-MM-DD') AS paid_through,
             ((now() AT TIME ZONE 'Asia/Kolkata')::date - a.paid_through_date)::int AS behind
        FROM ${S}.rent_waiver_requests w
        JOIN ${S}.rider_vehicle_assignments a ON a.id = w.assignment_id
        JOIN ${S}.riders ri ON ri.id = w.rider_id
       WHERE w.status = 'approved' AND w.credited_not_dated = false
       GROUP BY ri.name, a.id, a.status, a.daily_rent, a.rent_credit, a.paid_through_date
       ORDER BY ri.name`)).rows;

    if (!rows.length) {
      console.log("Nothing to correct — every approved waiver is already credit.");
      await c.query("ROLLBACK");
      await c.end();
      return;
    }

    const owed = (behind, rate, credit) =>
      Math.max(0, Math.ceil(Math.max(behind, 0) / 7) * rate * 7 - credit);

    const report = [];
    for (const r of rows) {
      const rate = Number(r.rate), credit = Number(r.credit), waived = Number(r.waived_days);
      // The whole days the old approval actually added to the date. The
      // fractional part never moved the date — it was already left as credit —
      // so only the whole days come back off.
      const wholeDays = Math.floor(waived + 1e-9);
      const value = Math.round(waived * rate * 100) / 100;
      const before = owed(r.behind, rate, credit);
      // Credit gains the value of the days we are removing from the date. The
      // fractional part is already sitting in rent_credit, so adding the FULL
      // waived value would double-count it — only the whole days move across.
      const newCredit = Math.round((credit + wholeDays * rate) * 100) / 100;
      const after = owed(r.behind + wholeDays, rate, newCredit);

      await c.query(
        `UPDATE ${S}.rider_vehicle_assignments
            SET paid_through_date = paid_through_date - $2::int,
                rent_credit = $3
          WHERE id = $1`,
        [r.assignment_id, wholeDays, newCredit]
      );
      await c.query(
        `UPDATE ${S}.rent_waiver_requests SET credited_not_dated = true
          WHERE assignment_id = $1 AND status = 'approved'`,
        [r.assignment_id]
      );

      report.push({
        rider: r.name.slice(0, 20), status: r.status, waived: `${waived}d`,
        value: inr(value),
        paid_through: `${r.paid_through} → ${new Date(new Date(r.paid_through).getTime() - wholeDays * 86400000).toISOString().slice(0, 10)}`,
        credit: `${inr(credit)} → ${inr(newCredit)}`,
        owed: r.status === "active" ? `${inr(before)} → ${inr(after)}` : "closed row",
        change: r.status !== "active" ? "—" : after === before ? "no change" : (after > before ? "+" : "") + inr(after - before),
      });
    }

    console.table(report);
    const live = rows.filter((r) => r.status === "active").length;
    console.log(`\nassignments corrected: ${rows.length}  (${live} live, ${rows.length - live} closed)`);

    // Nobody should be worse off. Say so out loud rather than hoping.
    const worse = report.filter((r) => r.change.startsWith("+"));
    console.log(worse.length ? `WARNING — ${worse.length} rider(s) now owe MORE: ${worse.map((r) => r.rider).join(", ")}`
                             : "no rider owes more than before");

    if (APPLY) { await c.query("COMMIT"); console.log("\nCOMMITTED."); }
    else { await c.query("ROLLBACK"); console.log("\nDry run — rolled back, nothing changed."); }
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  await c.end();
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
