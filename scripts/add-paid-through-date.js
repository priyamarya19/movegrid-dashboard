// Migration: paid_through_date on rider_vehicle_assignments — the new rolling-balance
// rent model. A rider owes again only once (today > paid_through_date + grace).
// Backfill: paid_through_date = (assigned_date - 1) + floor(total paid for this vehicle / daily_rent).
// This replays all historical payments as cumulative days, so it's equivalent to what the
// running-balance model would have produced from day one (order of past payments doesn't matter).
// Idempotent. Targets the schema in .env.local.
//   node scripts/add-paid-through-date.js
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";

(async () => {
  await client.connect();
  await client.query(`ALTER TABLE ${S}.rider_vehicle_assignments ADD COLUMN IF NOT EXISTS paid_through_date date`);
  console.log("✓ paid_through_date column ready");

  const asg = await client.query(`
    SELECT a.id, a.rider_id, a.vehicle_id, a.daily_rent,
      to_char(a.assigned_date, 'YYYY-MM-DD') AS assigned_date
    FROM ${S}.rider_vehicle_assignments a
    WHERE a.daily_rent IS NOT NULL
  `);

  let updated = 0;
  for (const a of asg.rows) {
    const paidRes = await client.query(
      `SELECT COALESCE(SUM(amount_collected), 0) AS total
       FROM ${S}.rider_payments WHERE rider_id = $1 AND vehicle_id = $2`,
      [a.rider_id, a.vehicle_id]
    );
    const totalPaid = Number(paidRes.rows[0].total);
    const daysPaid = Math.floor(totalPaid / Number(a.daily_rent));
    await client.query(
      `UPDATE ${S}.rider_vehicle_assignments
       SET paid_through_date = ($1::date - 1) + $2::int
       WHERE id = $3`,
      [a.assigned_date, daysPaid, a.id]
    );
    updated++;
  }
  console.log(`✓ Backfilled paid_through_date on ${updated} assignments`);
  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
