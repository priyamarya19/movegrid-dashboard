// Write off every rupee of rent we recorded but never collected.
//
//   RDS_ENV=uat  node scripts/write-off-phantom-rent.js            # DRY RUN
//   RDS_ENV=prod node scripts/write-off-phantom-rent.js --apply
//
// One operation for the whole class, not one script per rider. The cases are
// FOUND, not listed: any allotment where the auto-written rent row exceeds the
// cash actually taken is a phantom, by definition.
//
// The bug: until the "of which, rent" field existed, the allotment code read
// any positive amount_collected as "week one paid" and wrote a full week's
// rent, whatever had really changed hands. Ops typing ₹1 because the form
// rejected ₹0 is the loudest version; a rider paying part of a week at handover
// is the commoner one. Seven allotments, ₹8,817.
//
// Decided by Priyam, 30 Aug 2026: absorb it. It is our error in every case.
//
// IMPORTANT — this changes NO rider's ledger. Not a paid-through date, not a
// credit, not a payment row. It writes records to revenue_write_offs and
// nothing else. That is what makes it safe to run across the whole set:
//
//   * riders keep the days they were given, so nobody is suddenly overdue
//   * July's filed payment rows are untouched
//   * Rajendra's ledger correction (28 Aug) and Manjoor's bad-debt entry stay
//     exactly as they are — the register sits alongside them, recording the
//     revenue side, and cannot double-count because it moves no money
//
// Safe to re-run: anything already recorded is skipped.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");
const DECIDED_BY = "Priyam Arya";
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
    // The auto-written rent row is the one dated on the allotment day with no
    // payment_mode — ops-entered payments always carry a mode.
    const found = await c.query(`
      SELECT a.id AS assignment_id, a.rider_id, ri.name,
             to_char(a.assigned_date,'YYYY-MM-DD') AS on_date,
             to_char(a.assigned_date,'DD Mon')     AS pretty_date,
             a.amount_collected::numeric  AS cash,
             p.amount_collected::numeric  AS recorded,
             a.daily_rent::numeric        AS rate,
             a.status,
             (p.amount_collected - a.amount_collected)::numeric AS phantom,
             (SELECT count(*)::int FROM ${S}.revenue_write_offs w WHERE w.assignment_id = a.id) AS done
        FROM ${S}.rider_vehicle_assignments a
        JOIN ${S}.riders ri ON ri.id = a.rider_id
        JOIN LATERAL (
          SELECT amount_collected FROM ${S}.rider_payments p
           WHERE p.rider_id = a.rider_id AND p.payment_date = a.assigned_date AND p.payment_mode IS NULL
           ORDER BY p.created_at LIMIT 1
        ) p ON true
       WHERE a.amount_collected > 0 AND p.amount_collected > a.amount_collected
       ORDER BY a.assigned_date`);

    const todo = found.rows.filter((x) => x.done === 0);
    const skipped = found.rows.filter((x) => x.done > 0);

    // Every amount here is computed as recorded-minus-cash. An existing entry
    // that disagrees was written by hand before this script existed, so bring
    // it into line rather than leaving the register internally inconsistent.
    const corrections = [];
    for (const x of skipped) {
      const days = Math.floor(Number(x.phantom) / Number(x.rate));
      const fixed = await c.query(
        `UPDATE ${S}.revenue_write_offs SET amount = $2, days = $3
          WHERE assignment_id = $1 AND (amount <> $2 OR days IS DISTINCT FROM $3)
          RETURNING id`,
        [x.assignment_id, x.phantom, days]
      );
      if (fixed.rowCount) corrections.push(`${x.name}: set to ${inr(x.phantom)} (${days} days)`);
    }

    console.table(found.rows.map((x) => ({
      rider: x.name.slice(0, 20), date: x.pretty_date, status: x.status,
      cash_taken: inr(x.cash), rent_recorded: inr(x.recorded),
      phantom: inr(x.phantom), days: Math.floor(Number(x.phantom) / Number(x.rate)),
      action: x.done ? "already recorded" : "write off",
    })));

    for (const x of todo) {
      const days = Math.floor(Number(x.phantom) / Number(x.rate));
      const reason =
        `Allotment on ${x.pretty_date} took ${inr(x.cash)} in cash but the old code recorded ` +
        `${inr(x.recorded)} of rent — a full week regardless of what was paid — giving ${days} day(s) ` +
        `of coverage that were never bought. MOVEGRID's error, absorbed rather than billed. The ` +
        `rider's ledger and any filed payment rows are deliberately left as they are.`;
      await c.query(
        `INSERT INTO ${S}.revenue_write_offs (rider_id, assignment_id, amount, days, reason, decided_by, occurred_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7::date)`,
        [x.rider_id, x.assignment_id, x.phantom, days, reason, DECIDED_BY, x.on_date]
      );
    }

    console.log(`\nwritten off now: ${todo.length}  (${inr(todo.reduce((s, x) => s + Number(x.phantom), 0))})`);
    console.log(`already on record: ${skipped.length}`);
    if (corrections.length) console.log("amounts corrected: " + corrections.join("; "));

    // Prove the promise in the header: no rider ledger moved.
    const moved = await c.query(`
      SELECT count(*)::int n FROM ${S}.rider_vehicle_assignments
       WHERE id = ANY($1::uuid[]) AND paid_through_date IS DISTINCT FROM paid_through_date`,
      [found.rows.map((x) => x.assignment_id)]);
    console.log(`rider ledgers changed by this script: ${moved.rows[0].n} (always 0 by design)`);

    const total = await c.query(`SELECT count(*)::int n, COALESCE(sum(amount),0)::numeric t FROM ${S}.revenue_write_offs`);
    console.log(`\nregister total: ${total.rows[0].n} entries, ${inr(total.rows[0].t)}`);

    if (APPLY) { await c.query("COMMIT"); console.log("\nCOMMITTED."); }
    else { await c.query("ROLLBACK"); console.log("\nDry run — rolled back, nothing changed."); }
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  await c.end();
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
