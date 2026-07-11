// Phase 1: daily_rent on assignments + rent_dues ledger (the unbroken weekly cycle).
// Idempotent: safe to re-run. Targets the schema in .env.local (UAT).
//
//   node scripts/phase1-rent-ledger.js
//
// What it does:
//  1. ALTER rider_vehicle_assignments ADD daily_rent (if missing)
//  2. Backfill daily_rent (₹240/day standard) + MB-Unlimited/NXTE overrides (₹260)
//  3. CREATE rent_dues table (if missing)
//  4. Generate one weekly due per assignment from assigned_date -> returned_date (or today),
//     amount = daily_rent * 7. NEVER skips a week. Stops at return.

const { Client } = require("pg");
const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
// Shell env var wins over the .env.local file — needed because dashboard-prod and
// dashboard-uat share one directory/.env.local on the server; pm2 injects RDS_ENV
// per-process for the Next.js app, but a standalone cron invocation of this script
// has no pm2 process to inherit from, so it must be passable explicitly.
const rdsEnv = process.env.RDS_ENV || env.RDS_ENV;
const S = rdsEnv === "uat" ? "mg_data_uat" : "mg_data";

// MB-Unlimited riders (₹260/day) by mobile — everyone else defaults by model.
const MB_UNLIMITED = new Set(["7982212139", "7319845124", "9560759578", "9568080124"]);

const istToday = () => { const d = new Date(Date.now() + 5.5 * 3600 * 1000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const iso = (d) => d.toISOString().slice(0, 10);

async function run() {
  await client.connect();
  console.log(`Connected to ${env.RDS_DATABASE} (schema ${S})\n`);
  await client.query("BEGIN");
  try {
    // 1. daily_rent column
    await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS daily_rent numeric`);
    console.log("✓ daily_rent column ready");

    // 2. backfill daily_rent by model, override MB-Unlimited
    const asg = await client.query(`
      SELECT a.id, a.daily_rent, a.continues_from_assignment_id,
             to_char(a.assigned_date,'YYYY-MM-DD') AS assigned_date,
             to_char(a.returned_date,'YYYY-MM-DD') AS returned_date,
             a.rider_id, a.vehicle_id, r.mobile, m.oem
      FROM ${S}.rider_vehicle_assignments a
      JOIN ${S}.riders r ON r.id = a.rider_id
      JOIN ${S}.vehicles v ON v.id = a.vehicle_id
      JOIN ${S}.vehicle_models m ON m.id = v.model_id
      ORDER BY a.assigned_date`);
    let rateSet = 0;
    for (const a of asg.rows) {
      if (a.daily_rent != null) continue; // don't overwrite an ops-entered rate
      let rate = 240; // Shelby & EV Juno both bill ₹240/day (₹1,680/wk) per the rent sheet
      if (MB_UNLIMITED.has((a.mobile || "").replace(/\D/g, ""))) rate = 260;
      await client.query(`UPDATE ${S}.rider_vehicle_assignments SET daily_rent = $1 WHERE id = $2`, [rate, a.id]);
      a.daily_rent = rate; rateSet++;
    }
    console.log(`✓ daily_rent backfilled on ${rateSet} assignments`);

    // 3. rent_dues table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${S}.rent_dues (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id uuid NOT NULL REFERENCES ${S}.rider_vehicle_assignments(id) ON DELETE CASCADE,
        rider_id uuid NOT NULL,
        vehicle_id uuid NOT NULL,
        week_no int NOT NULL,
        period_start date NOT NULL,
        period_end date NOT NULL,
        due_date date NOT NULL,
        amount numeric NOT NULL,
        created_at timestamptz DEFAULT now(),
        UNIQUE(assignment_id, week_no)
      )`);
    console.log("✓ rent_dues table ready");

    // 4. generate dues — unbroken weekly cycle per assignment, stop at return.
    // A week is billable only if it STARTED before the cutoff:
    //   returned -> cutoff = returned_date (a week beginning on the return day = 0 days used = no rent)
    //   active   -> cutoff = tomorrow (so the current week is included)
    const today = istToday();
    let duesUpserted = 0;
    // Tracks the last week_no AND last period_end generated per assignment, in
    // assigned_date order, so a continuation (continues_from_assignment_id) picks up
    // both its numbering AND its period cadence from exactly where the linked (always-
    // earlier) assignment left off — Week 3 ending 1 Jul means Week 4 starts 2 Jul,
    // regardless of the new vehicle's own assigned_date. The vehicle changed; the
    // rider's unbroken weekly billing rhythm didn't.
    const lastWeekByAssignment = {};
    const lastPeriodEndByAssignment = {};
    for (const a of asg.rows) {
      const cutoff = a.returned_date ? new Date(a.returned_date + "T00:00:00Z") : addDays(today, 1);
      const amount = Number(a.daily_rent) * 7;
      // wipe + regenerate this assignment's dues so stale/over-generated weeks are removed
      await client.query(`DELETE FROM ${S}.rent_dues WHERE assignment_id = $1`, [a.id]);

      const linkedEnd = a.continues_from_assignment_id && lastPeriodEndByAssignment[a.continues_from_assignment_id];
      const startWeek = linkedEnd ? (lastWeekByAssignment[a.continues_from_assignment_id] || 0) + 1 : 1;
      const start = linkedEnd ? addDays(linkedEnd, 1) : new Date(a.assigned_date + "T00:00:00Z");

      let week = startWeek;
      let lastPe = addDays(start, -1);
      for (let ps = new Date(start); ps < cutoff; ps = addDays(ps, 7), week++) {
        const pe = addDays(ps, 6);
        await client.query(`
          INSERT INTO ${S}.rent_dues (assignment_id, rider_id, vehicle_id, week_no, period_start, period_end, due_date, amount)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [a.id, a.rider_id, a.vehicle_id, week, iso(ps), iso(pe), iso(addDays(ps, -1)), amount]); // rent in advance: due = day before cycle start
        duesUpserted++;
        lastPe = pe;
      }
      lastWeekByAssignment[a.id] = week - 1;
      lastPeriodEndByAssignment[a.id] = lastPe;
    }
    console.log(`✓ rent_dues regenerated: ${duesUpserted} weekly dues across ${asg.rows.length} assignments`);

    await client.query("COMMIT");
    console.log("\n✅ Phase 1 ledger applied.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n❌ ROLLBACK:", e.message); process.exit(1);
  } finally { await client.end(); }
}
run();
