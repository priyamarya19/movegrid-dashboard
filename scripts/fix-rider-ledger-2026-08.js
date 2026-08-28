// One-time corrections to live rider money, agreed with Priyam and ops.
//
//   RDS_ENV=prod node scripts/fix-rider-ledger-2026-08.js            # DRY RUN
//   RDS_ENV=prod node scripts/fix-rider-ledger-2026-08.js --apply
//
// Four separate faults, all found while reconciling Rajendra Prasad's account
// against what ops actually told him:
//
//  A. Two riders billed for days they held no vehicle — a new allotment
//     inherited a paid-through date from before it started.
//  B. Sub-day credit lost when data moved UAT -> prod at go-live: the
//     rent_credit column did not exist in prod until migration 013 on 20 Jul,
//     so credit created before then could not be copied.
//  C. Rajendra's ₹1,679 bad debt double-counts the same unpaid stretch the
//     rolling ledger already charges, and the ₹960 he paid in rent was filed
//     as a penalty labelled "Rent pending".
//  D. Sonu Yadav's ₹1 placeholder at allotment was read as "week 1 paid" and
//     fabricated a ₹1,820 payment plus seven days of coverage he never bought.
//
// Everything runs in ONE transaction and prints before/after per rider.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");
const inr = (n) => "₹" + Math.round(Number(n)).toLocaleString("en-IN");

// Ops' reckoning, confirmed by them on 22 Aug: Rajendra was level that day,
// i.e. paid through the 21st. The 2-day maintenance waiver is already inside
// that figure. Ankesh simply starts the day after handover, per the rule
// adopted on 20 Aug — the handover day itself is free.
const PAID_THROUGH = {
  "Rajendra prasad": "2026-08-21",
  "Ankesh kumar": "2026-08-17",
};
// Sub-day credit each rider should be holding (their own money).
const CREDIT_BACK = {
  "Rohit Sharma": 20, "Ghanshyam Murari": 100, "Mohit pal": 60, "Rinku": 20,
};
// Rajendra's ₹1 is NOT here: it is the placeholder ops typed because the form
// rejects ₹0, not money he paid. Priyam flagged this explicitly.

const q = (c, sql, p) => c.query(sql, p);

async function riderByName(c, name) {
  const r = await q(c, `SELECT id, name FROM ${S}.riders WHERE name ILIKE $1`, [name]);
  if (r.rows.length !== 1) throw new Error(`expected exactly 1 rider for "${name}", found ${r.rows.length}`);
  return r.rows[0];
}
async function position(c, riderId) {
  const r = await q(c, `
    SELECT to_char(a.paid_through_date,'DD Mon') AS paid_thru, a.rent_credit::numeric AS credit,
      GREATEST(0, CEIL(GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - a.paid_through_date,0)/7.0)::int
        * a.daily_rent*7 - COALESCE(a.rent_credit,0))::int AS outstanding
    FROM ${S}.rider_vehicle_assignments a WHERE a.rider_id=$1 AND a.status='active'`, [riderId]);
  return r.rows[0] ?? { paid_thru: "—", credit: 0, outstanding: 0 };
}

(async () => {
  const c = new Client({
    host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
    password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Target: ${S}   mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply)"}\n`);
  const before = {}, after = {};
  const names = [...new Set([...Object.keys(PAID_THROUGH), ...Object.keys(CREDIT_BACK), "Sonu Yadav"])];
  for (const n of names) { const r = await riderByName(c, n); before[n] = await position(c, r.id); }

  await q(c, "BEGIN");
  try {
    // ── A. days billed with no vehicle ──────────────────────────────────
    for (const [name, date] of Object.entries(PAID_THROUGH)) {
      const r = await riderByName(c, name);
      await q(c, `UPDATE ${S}.rider_vehicle_assignments SET paid_through_date = $2::date
                  WHERE rider_id = $1 AND status = 'active'`, [r.id, date]);
      console.log(`A. ${name}: paid-through set to ${date}`);
    }

    // ── B. credit lost at go-live ───────────────────────────────────────
    for (const [name, amount] of Object.entries(CREDIT_BACK)) {
      const r = await riderByName(c, name);
      await q(c, `UPDATE ${S}.rider_vehicle_assignments
                  SET rent_credit = COALESCE(rent_credit,0) + $2
                  WHERE rider_id = $1 AND status = 'active'`, [r.id, amount]);
      console.log(`B. ${name}: ${inr(amount)} credit restored`);
    }

    // ── C. Rajendra's bad debt and mislabelled penalty ──────────────────
    const raj = await riderByName(c, "Rajendra prasad");
    const bd = await q(c, `DELETE FROM ${S}.bad_debts WHERE rider_id=$1 RETURNING original_outstanding::int AS amt`, [raj.id]);
    if (bd.rowCount) console.log(`C. Rajendra: bad debt of ${inr(bd.rows[0].amt)} removed (double count)`);
    const pen = await q(c, `DELETE FROM ${S}.rider_penalties
                            WHERE rider_id=$1 AND amount=960 AND detail ILIKE '%rent%' RETURNING vehicle_id`, [raj.id]);
    if (pen.rowCount) {
      // It was rent, so it belongs in the rent ledger. Display only — the days
      // it bought are already inside the paid-through date set above.
      await q(c, `INSERT INTO ${S}.rider_payments
                    (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end, payment_mode)
                  VALUES ($1,$2,960,'2026-08-14','2026-07-31','2026-08-03','Cash')`, [raj.id, pen.rows[0].vehicle_id]);
      console.log("C. Rajendra: ₹960 moved from penalty to rent (31 Jul – 3 Aug)");
    }

    // ── D. Sonu Yadav's phantom week ────────────────────────────────────
    const sonu = await riderByName(c, "Sonu Yadav");
    const ph = await q(c, `UPDATE ${S}.rider_payments SET amount_collected = 1
                           WHERE rider_id=$1 AND payment_date='2026-07-17' AND amount_collected=1820
                             AND payment_mode IS NULL RETURNING id`, [sonu.id]);
    if (ph.rowCount) {
      await q(c, `UPDATE ${S}.rider_vehicle_assignments SET paid_through_date = paid_through_date - 7
                  WHERE rider_id=$1 AND status='active'`, [sonu.id]);
      console.log("D. Sonu Yadav: fabricated ₹1,820 corrected to the ₹1 actually taken; 7 days removed");
    } else {
      console.log("D. Sonu Yadav: phantom row not found — already corrected?");
    }

    for (const n of names) { const r = await riderByName(c, n); after[n] = await position(c, r.id); }

    console.log("\nBEFORE → AFTER");
    console.table(names.map((n) => ({
      rider: n,
      paid_through: `${before[n].paid_thru} → ${after[n].paid_thru}`,
      credit: `${inr(before[n].credit)} → ${inr(after[n].credit)}`,
      outstanding: `${inr(before[n].outstanding)} → ${inr(after[n].outstanding)}`,
    })));

    if (APPLY) { await q(c, "COMMIT"); console.log("\nCOMMITTED."); }
    else { await q(c, "ROLLBACK"); console.log("\nDry run — rolled back, nothing changed."); }
  } catch (e) {
    await q(c, "ROLLBACK");
    throw e;
  }
  await c.end();
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
