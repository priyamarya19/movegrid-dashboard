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

// Expected vs collected per calendar week (by rent-due period start), for the
// Collections funnel chart. Only weeks that have started are included; a "paid"
// figure is derived from paid_through_date (same rolling-balance model as the
// rest of the app), capped at the week's amount.
export type WeeklyCollection = { week: string; expected: number; collected: number };
export const getWeeklyCollections = unstable_cache(async function getWeeklyCollections(): Promise<WeeklyCollection[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT to_char(date_trunc('week', d.period_start), 'YYYY-MM-DD') AS week,
           SUM(d.amount)::numeric AS expected,
           SUM(LEAST(GREATEST(0, LEAST(COALESCE(a.paid_through_date, a.assigned_date - 1), d.period_end) - d.period_start + 1) * a.daily_rent, d.amount))::numeric AS collected
    FROM ${S}.rent_dues d
    JOIN ${S}.rider_vehicle_assignments a ON a.id = d.assignment_id
    WHERE d.period_start <= ${IST}
    GROUP BY 1 ORDER BY 1`);
  return res.rows.map((r) => ({ week: r.week, expected: Number(r.expected), collected: Number(r.collected) }));
}, ["weekly-collections-v1"], { revalidate: 60 });

// Live chase list: every active rider with an outstanding balance, how many days
// behind they are (from paid_through_date), and the ops sheet note if any.
// next_due_date is the rider's weekly cycle boundary anchored on paid_through_date
// (their real payment rhythm — assigned_date goes stale after an issue-swap): it
// stays put through the 2-day grace after a missed due date, then rolls to the
// next week boundary — e.g. week 1st–7th, due the 7th; unpaid past the 9th → 14th.
// Never-paid riders anchor on the allotment date (week 1 due = assigned + 6).
export type ChaseRow = {
  rider_id: string; rider_code: string | null; name: string;
  allotment_code: string | null; days_behind: number; outstanding: number;
  next_due_date: string; sheet_note: string | null;
};
export const getChaseList = unstable_cache(async function getChaseList(): Promise<ChaseRow[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.rider_code, r.name, a.allotment_code, a.sheet_note,
      GREATEST(0, ${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) AS days_behind,
      GREATEST(0, ${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) * a.daily_rent AS outstanding,
      to_char(
        (CASE WHEN COALESCE(a.paid_through_date, a.assigned_date - 1) >= a.assigned_date
          THEN a.paid_through_date
               + 7 * CEIL(GREATEST(${IST} - 1 - a.paid_through_date, 0) / 7.0)::int
          ELSE (a.assigned_date - 1)
               + 7 * GREATEST(1, CEIL(GREATEST(${IST} - a.assigned_date, 0) / 7.0)::int)
        END),
        'YYYY-MM-DD') AS next_due_date
    FROM ${S}.rider_vehicle_assignments a
    JOIN ${S}.riders r ON r.id = a.rider_id
    WHERE a.status = 'active'
    ORDER BY outstanding DESC`);
  return res.rows.map((r) => ({
    rider_id: r.rider_id, rider_code: r.rider_code, name: r.name, allotment_code: r.allotment_code,
    days_behind: Number(r.days_behind), outstanding: Number(r.outstanding),
    next_due_date: r.next_due_date, sheet_note: r.sheet_note,
  }));
}, ["chase-list-v3"], { revalidate: 60 });
