// Write off the seven days Sonu Yadav was credited but never paid for.
//
//   RDS_ENV=uat  node scripts/write-off-sonu-phantom-week.js            # DRY RUN
//   RDS_ENV=prod node scripts/write-off-sonu-phantom-week.js --apply
//
// Decided by Priyam, 30 Aug 2026.
//
// What happened: his 17 July allotment was a continuation with no cash. Ops
// typed ₹1 because the form would not accept ₹0, and the allotment code read
// any positive amount as a full week paid — recording ₹1,820 and handing him
// seven days of coverage. The fault is entirely ours; he has paid ₹1,820 every
// Thursday since 23 July without missing one.
//
// What this script does NOT do, deliberately:
//
//   * It does not touch his paid_through_date. Writing it off means he keeps
//     the seven days. Removing them would put ₹1,820 on his account as due.
//   * It does not touch the 17 July payment row. July's GST is filed and that
//     row is part of what was submitted.
//
// So the only change is the record itself. His ledger is untouched.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const isUAT = (process.env.RDS_ENV || env.RDS_ENV) === "uat";
const S = isUAT ? "mg_data_uat" : "mg_data";
const APPLY = process.argv.includes("--apply");

const AMOUNT = 1820;
const DAYS = 7;
const REASON =
  "17 Jul continuation took ₹1 in cash (the form rejected ₹0) and the allotment code " +
  "recorded a full week, giving 7 days of coverage that were never bought. MOVEGRID's " +
  "error, not the rider's — he has paid every week since 23 Jul. Absorbed rather than " +
  "billed. His paid-through date and the filed July payment row are both left as they are.";

(async () => {
  const c = new Client({
    host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER,
    password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log(`Target: ${S}   mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply)"}\n`);

  await c.query("BEGIN");
  try {
    const rider = await c.query(`SELECT id, name FROM ${S}.riders WHERE name ILIKE $1`, ["Sonu Yadav"]);
    if (rider.rows.length !== 1) throw new Error(`expected exactly 1 Sonu Yadav, found ${rider.rows.length}`);
    const r = rider.rows[0];

    const asgn = await c.query(
      `SELECT id, to_char(assigned_date,'YYYY-MM-DD') d FROM ${S}.rider_vehicle_assignments
        WHERE rider_id = $1 AND assigned_date = '2026-07-17'`,
      [r.id]
    );
    if (!asgn.rows[0]) throw new Error("could not find the 17 Jul assignment");

    // Refuse to write the same thing twice.
    const already = await c.query(
      `SELECT id FROM ${S}.revenue_write_offs WHERE rider_id = $1 AND occurred_on = '2026-07-17'`,
      [r.id]
    );
    if (already.rows[0]) {
      console.log("Already written off — nothing to do.");
      await c.query("ROLLBACK");
      await c.end();
      return;
    }

    const before = await c.query(
      `SELECT to_char(paid_through_date,'DD Mon') pt, COALESCE(rent_credit,0)::int credit
         FROM ${S}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active'`,
      [r.id]
    );

    await c.query(
      `INSERT INTO ${S}.revenue_write_offs (rider_id, assignment_id, amount, days, reason, decided_by, occurred_on)
       VALUES ($1, $2, $3, $4, $5, 'Priyam Arya', '2026-07-17')`,
      [r.id, asgn.rows[0].id, AMOUNT, DAYS, REASON]
    );

    const after = await c.query(
      `SELECT to_char(paid_through_date,'DD Mon') pt, COALESCE(rent_credit,0)::int credit
         FROM ${S}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active'`,
      [r.id]
    );

    console.log(`Written off: ₹${AMOUNT} (${DAYS} days) against ${r.name}, dated 17 Jul 2026.`);
    console.log(`His ledger, before → after:  paid through ${before.rows[0].pt} → ${after.rows[0].pt}` +
                `,  credit ₹${before.rows[0].credit} → ₹${after.rows[0].credit}`);
    console.log("(unchanged is correct — writing it off means he keeps the days)");

    const total = await c.query(`SELECT count(*)::int n, COALESCE(sum(amount),0)::int t FROM ${S}.revenue_write_offs`);
    console.log(`\nwrite-off register now: ${total.rows[0].n} entr(y/ies), ₹${total.rows[0].t} total`);

    if (APPLY) { await c.query("COMMIT"); console.log("\nCOMMITTED."); }
    else { await c.query("ROLLBACK"); console.log("\nDry run — rolled back, nothing changed."); }
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  await c.end();
})().catch((e) => { console.error("FAILED (rolled back):", e.message); process.exit(1); });
