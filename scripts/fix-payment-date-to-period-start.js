// One-time data fix: rider_payments.payment_date was backfilled to equal
// rental_period_end (last day of the rent week) instead of the actual collection
// date. Since rent is paid in advance, rental_period_start is the correct proxy.
// Only touches rows matching the exact bug pattern; new app-recorded payments
// (payment_date = CURRENT_DATE at insert time) are untouched. Idempotent.
//   node scripts/fix-payment-date-to-period-start.js
const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const [k, ...v] = l.split("="); if (k && k.trim()) a[k.trim()] = v.join("=").trim(); return a;
}, {});
const client = new Client({ host: env.RDS_HOST, port: +env.RDS_PORT, user: env.RDS_USER, password: env.RDS_PASSWORD, database: env.RDS_DATABASE, ssl: { rejectUnauthorized: false } });
const S = env.RDS_ENV === "uat" ? "mg_data_uat" : "mg_data";

(async () => {
  await client.connect();
  const before = await client.query(`
    SELECT COUNT(*) FILTER (WHERE payment_date = rental_period_end) AS eq_end,
           COUNT(*) FILTER (WHERE payment_date = rental_period_start) AS eq_start
    FROM ${S}.rider_payments`);
  console.log(`Before: ${before.rows[0].eq_end} rows = period_end, ${before.rows[0].eq_start} rows = period_start`);

  const res = await client.query(`
    UPDATE ${S}.rider_payments
    SET payment_date = rental_period_start
    WHERE payment_date = rental_period_end`);
  console.log(`✓ Updated ${res.rowCount} rows in ${S}.rider_payments`);

  const after = await client.query(`
    SELECT COUNT(*) FILTER (WHERE payment_date = rental_period_end) AS eq_end,
           COUNT(*) FILTER (WHERE payment_date = rental_period_start) AS eq_start
    FROM ${S}.rider_payments`);
  console.log(`After: ${after.rows[0].eq_end} rows = period_end, ${after.rows[0].eq_start} rows = period_start`);

  await client.end();
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
