// Read-only preview: what changes if week 1 is anchored on rent_start_date
// instead of assigned_date.
//
// The ledger has always started week 1 on the handover day, while the money
// (paid_through_date) has always started on the first chargeable day — the day
// after. So every printed week has run one day ahead of the rent it represents.
// This script replays the generator both ways and reports the difference. It
// writes nothing.
//
//   RDS_ENV=prod node scripts/preview-week-anchor.js

const { Client } = require("pg");
const fs = require("fs");
const { generateWeeks, addDaysISO } = require("../lib/rentMath");

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const rdsEnv = process.env.RDS_ENV || env.RDS_ENV;
const S = rdsEnv === "uat" ? "mg_data_uat" : "mg_data";
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
  password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });

const istToday = () => {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const iso = (d) => d.toISOString().slice(0, 10);

// Replay the generator exactly as scripts/phase1-rent-ledger.js does, with the
// week-1 anchor swapped in. Continuations keep inheriting cadence from the
// linked assignment, so a swap chain still moves as one.
function build(rows, anchorOf, todayISO) {
  const out = new Map();
  const lastWeek = {}, lastEnd = {};
  for (const a of rows) {
    const cutoff = a.returned_date || addDaysISO(todayISO, 1);
    const linkedEnd = a.continues_from_assignment_id && lastEnd[a.continues_from_assignment_id];
    const startISO = linkedEnd ? addDaysISO(linkedEnd, 1) : anchorOf(a);
    const startWeek = linkedEnd ? (lastWeek[a.continues_from_assignment_id] || 0) + 1 : 1;
    const { weeks, lastWeekNo, lastPeriodEnd } = generateWeeks({ startISO, cutoffISO: cutoff, startWeekNo: startWeek });
    out.set(a.id, weeks);
    lastWeek[a.id] = lastWeekNo;
    lastEnd[a.id] = lastPeriodEnd;
  }
  return out;
}

async function run() {
  await client.connect();
  const todayISO = iso(istToday());
  console.log(`schema ${S} · today ${todayISO}\n`);

  const asg = await client.query(`
    SELECT a.id, a.daily_rent, a.continues_from_assignment_id, a.status,
           to_char(a.assigned_date,'YYYY-MM-DD')   AS assigned_date,
           to_char(a.rent_start_date,'YYYY-MM-DD') AS rent_start_date,
           to_char(a.returned_date,'YYYY-MM-DD')   AS returned_date,
           to_char(a.paid_through_date,'YYYY-MM-DD') AS paid_through,
           r.name, v.ev_number
    FROM ${S}.rider_vehicle_assignments a
    JOIN ${S}.riders r   ON r.id = a.rider_id
    JOIN ${S}.vehicles v ON v.id = a.vehicle_id
    ORDER BY a.assigned_date`);

  const before = build(asg.rows, (a) => a.assigned_date, todayISO);
  const after  = build(asg.rows, (a) => a.rent_start_date || a.assigned_date, todayISO);

  // ── 1. does the number of billable weeks change anywhere? ────────────────
  // This is the only way the change could touch money: a final week that used
  // to start before the return day now starts on or after it, so it vanishes.
  let weeksBefore = 0, weeksAfter = 0, rupeesBefore = 0, rupeesAfter = 0;
  const countChanged = [];
  for (const a of asg.rows) {
    const b = before.get(a.id).length, f = after.get(a.id).length;
    weeksBefore += b; weeksAfter += f;
    rupeesBefore += b * Number(a.daily_rent) * 7;
    rupeesAfter  += f * Number(a.daily_rent) * 7;
    if (b !== f) countChanged.push({ name: a.name, ev: a.ev_number, status: a.status,
      assigned: a.assigned_date, rent_start: a.rent_start_date, returned: a.returned_date,
      weeks_before: b, weeks_after: f, rupees: (f - b) * Number(a.daily_rent) * 7 });
  }
  console.log(`weeks generated : ${weeksBefore} → ${weeksAfter}   (${weeksAfter - weeksBefore >= 0 ? "+" : ""}${weeksAfter - weeksBefore})`);
  console.log(`expected rupees : ₹${rupeesBefore.toLocaleString("en-IN")} → ₹${rupeesAfter.toLocaleString("en-IN")}   (${rupeesAfter - rupeesBefore >= 0 ? "+" : ""}₹${(rupeesAfter - rupeesBefore).toLocaleString("en-IN")})`);
  if (countChanged.length) {
    console.log(`\n⚠ ${countChanged.length} assignment(s) gain or lose a week:`);
    console.table(countChanged);
  } else {
    console.log("✓ no assignment gains or loses a week — every period simply moves one day later");
  }

  // ── 2. how the rider profile reads, before and after ─────────────────────
  // paid for a week = the days of that week actually covered by paid_through,
  // which is the formula in lib/rent.ts. A week is mislabelled when a rider who
  // owes nothing is shown as Partial.
  const label = (paidDays, rate) => {
    const amount = rate * 7, paid = paidDays * rate;
    if (paid >= amount) return "Collected";
    if (paid > 0) return "Partial";
    return "Pending";
  };
  const days = (ps, pe, pt) => {
    if (!pt) return 0;
    const end = pt < pe ? pt : pe;
    return Math.max(0, Math.round((new Date(end + "T00:00:00Z") - new Date(ps + "T00:00:00Z")) / 86400000) + 1);
  };

  const fixed = [];
  for (const a of asg.rows) {
    if (a.status !== "active") continue;
    const rate = Number(a.daily_rent);
    for (const w of before.get(a.id)) {
      const st = label(days(w.periodStart, w.periodEnd, a.paid_through), rate);
      if (st !== "Partial") continue;
      // the same week, one day later
      const ps = addDaysISO(w.periodStart, 1), pe = addDaysISO(w.periodEnd, 1);
      const now = label(days(ps, pe, a.paid_through), rate);
      fixed.push({ name: a.name, week: w.weekNo,
        before: `${w.periodStart}→${w.periodEnd}  ${st} ₹${days(w.periodStart, w.periodEnd, a.paid_through) * rate}`,
        after: `${ps}→${pe}  ${now} ₹${days(ps, pe, a.paid_through) * rate}`,
        paid_through: a.paid_through });
    }
  }
  console.log(`\nactive weeks currently showing Partial: ${fixed.length}`);
  if (fixed.length) console.table(fixed);

  // ── 3. nothing financial moves ───────────────────────────────────────────
  const money = await client.query(`
    SELECT COALESCE(SUM(amount_collected),0)::numeric AS collected,
           count(*)::int AS payments FROM ${S}.rider_payments`);
  console.log(`\nrent_payments untouched by this change: ₹${Number(money.rows[0].collected).toLocaleString("en-IN")} across ${money.rows[0].payments} payments`);
  console.log("(revenue and GST read rider_payments.payment_date; rent_dues is the expected-side ledger only)");

  await client.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
