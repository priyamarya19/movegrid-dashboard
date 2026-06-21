import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";

// Month-to-date window, in IST (the business timezone used elsewhere in the app).
const IST = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

// Rent that *should* have accrued this month vs what was actually collected.
// Expected = per-vehicle days-on-rent (this month) × that model's daily rate.
export const getCollectionMTD = unstable_cache(async function getCollectionMTD() {
  const [collectedRes, expectedRes] = await Promise.all([
    pool.query(`
      SELECT COALESCE(SUM(amount_collected), 0) AS total
      FROM ${schemas.ops}.rider_payments
      WHERE payment_date >= date_trunc('month', ${IST})::date
        AND payment_date <= ${IST}
    `),
    pool.query(`
      WITH win AS (SELECT date_trunc('month', ${IST})::date AS s, ${IST} AS e)
      SELECT COALESCE(SUM(
        GREATEST((LEAST(COALESCE(a.returned_date, w.e), w.e) - GREATEST(a.assigned_date, w.s)) + 1, 0)
        * COALESCE(m.rental_per_day, 0)
      ), 0) AS total
      FROM ${schemas.ops}.rider_vehicle_assignments a
      JOIN ${schemas.ops}.vehicles v ON v.id = a.vehicle_id
      JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      CROSS JOIN win w
      WHERE a.assigned_date <= w.e AND COALESCE(a.returned_date, w.e) >= w.s
    `),
  ]);
  const collected = Number(collectedRes.rows[0].total);
  const expected = Number(expectedRes.rows[0].total);
  return { collected, expected, pending: expected - collected, pct: expected > 0 ? Math.round((collected / expected) * 100) : 0 };
}, ["collection-mtd-v1"], { revalidate: 60 });

export type PendingRider = {
  rider_id: string; rider_code: string | null; name: string; mobile: string;
  vehicle_id: string | null; ev_number: string | null; model_name: string | null;
  days: number; expected: number; collected: number; pending: number;
};

// Per-rider breakdown of this month's expected vs collected, pending first.
export const getPendingByRider = unstable_cache(async function getPendingByRider(): Promise<PendingRider[]> {
  const res = await pool.query(`
    WITH win AS (SELECT date_trunc('month', ${IST})::date AS s, ${IST} AS e),
    exp AS (
      SELECT a.rider_id,
        SUM(GREATEST((LEAST(COALESCE(a.returned_date, w.e), w.e) - GREATEST(a.assigned_date, w.s)) + 1, 0)) AS days,
        SUM(GREATEST((LEAST(COALESCE(a.returned_date, w.e), w.e) - GREATEST(a.assigned_date, w.s)) + 1, 0) * COALESCE(m.rental_per_day, 0)) AS expected
      FROM ${schemas.ops}.rider_vehicle_assignments a
      JOIN ${schemas.ops}.vehicles v ON v.id = a.vehicle_id
      JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      CROSS JOIN win w
      WHERE a.assigned_date <= w.e AND COALESCE(a.returned_date, w.e) >= w.s
      GROUP BY a.rider_id
    ),
    col AS (
      SELECT p.rider_id, SUM(p.amount_collected) AS collected
      FROM ${schemas.ops}.rider_payments p, win w
      WHERE p.payment_date >= w.s AND p.payment_date <= w.e
      GROUP BY p.rider_id
    )
    SELECT r.id AS rider_id, r.rider_code, r.name, r.mobile,
      exp.days::int AS days, exp.expected::numeric AS expected,
      COALESCE(col.collected, 0)::numeric AS collected,
      (exp.expected - COALESCE(col.collected, 0))::numeric AS pending,
      cur.vehicle_id, cv.ev_number, cm.model_name
    FROM exp
    JOIN ${schemas.ops}.riders r ON r.id = exp.rider_id
    LEFT JOIN col ON col.rider_id = exp.rider_id
    LEFT JOIN LATERAL (
      SELECT vehicle_id FROM ${schemas.ops}.rider_vehicle_assignments
      WHERE rider_id = r.id AND status = 'active' ORDER BY assigned_date DESC LIMIT 1
    ) cur ON true
    LEFT JOIN ${schemas.ops}.vehicles cv ON cv.id = cur.vehicle_id
    LEFT JOIN ${schemas.ops}.vehicle_models cm ON cm.id = cv.model_id
    WHERE (exp.expected - COALESCE(col.collected, 0)) > 0
    ORDER BY pending DESC
  `);
  return res.rows.map((r) => ({
    rider_id: r.rider_id, rider_code: r.rider_code, name: r.name, mobile: r.mobile,
    vehicle_id: r.vehicle_id, ev_number: r.ev_number, model_name: r.model_name,
    days: Number(r.days), expected: Number(r.expected), collected: Number(r.collected), pending: Number(r.pending),
  }));
}, ["pending-by-rider-v1"], { revalidate: 60 });
