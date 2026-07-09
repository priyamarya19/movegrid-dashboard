import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";

// Single source of truth for rent numbers. Every dashboard (admin/ops/investor), the
// rider page, the email reports, and the mobile app all read from these functions —
// never re-derive overdue/due-soon status independently. Change the logic here once
// and it reflects everywhere.

// Canonical payment-mode vocabulary. Shared by the rent-received and return
// settlement routes so the accepted values (and their validation) live in one place.
export const PAYMENT_MODES = ["Cash", "Online", "Cash + Online"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const IST = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
// A rider only becomes Overdue after a 2-day grace past their paid-through date.
export const OVERDUE_CUTOFF = `(${IST} - 2)`;

// Rolling-balance rent model: every rider has one paid_through_date (on their active
// assignment). A payment of any amount, at any time, just extends it by
// (amount / daily_rate) days — it doesn't need to be tied to a specific week. This is
// what makes an irregular/advance payment (e.g. 10 days paid mid-week) correctly roll
// into the next week instead of vanishing.
//
// getOverdueRiders/getDueSoonRiders/getLedgerSummary's "overdue" figure compare
// paid_through_date directly against today — NOT against rent_dues rows, because
// rent_dues is a periodically-regenerated display ledger that can go stale between
// runs. paid_through_date is always current. getRiderCycle is the one exception: it
// exists specifically to show per-week history, so it legitimately needs rent_dues.
export const PAID_FROM_BALANCE = `
  GREATEST(0, LEAST(COALESCE(a.paid_through_date, a.assigned_date - 1), d.period_end) - d.period_start + 1) * a.daily_rent`;

export type CycleWeek = {
  week_no: number; period_start: string; period_end: string; due_date: string;
  amount: number; paid: number; status: string; ev_number: string | null; vehicle_id: string | null;
};

// Full unbroken weekly cycle for one rider (across all their assignments) — per-week
// history for the rider profile page. The only function here that reads rent_dues.
export async function getRiderCycle(riderId: string): Promise<CycleWeek[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT week_no, period_start, period_end, due_date, amount, paid, ev_number, vehicle_id,
      CASE WHEN paid >= amount THEN 'Collected'
           WHEN paid > 0 THEN 'Partial'
           WHEN asgn_status = 'active' AND ps_dt < ${OVERDUE_CUTOFF} THEN 'Overdue'
           ELSE 'Pending' END AS status
    FROM (
      SELECT d.week_no,
        to_char(d.period_start,'YYYY-MM-DD') AS period_start,
        to_char(d.period_end,'YYYY-MM-DD') AS period_end,
        to_char(d.due_date,'YYYY-MM-DD') AS due_date,
        d.period_start AS ps_dt, d.vehicle_id, a.status AS asgn_status,
        d.amount, ${PAID_FROM_BALANCE} AS paid, v.ev_number, a.assigned_date
      FROM ${S}.rent_dues d
      JOIN ${S}.rider_vehicle_assignments a ON a.id = d.assignment_id
      LEFT JOIN ${S}.vehicles v ON v.id = d.vehicle_id
      WHERE d.rider_id = $1
    ) q
    ORDER BY assigned_date, period_start`, [riderId]);
  return res.rows.map((r) => ({
    week_no: r.week_no, period_start: r.period_start, period_end: r.period_end, due_date: r.due_date,
    amount: Number(r.amount), paid: Number(r.paid), status: r.status, ev_number: r.ev_number, vehicle_id: r.vehicle_id,
  }));
}

// All-time ledger summary — the headline numbers shared by every dashboard.
// expected/collected are historical (need rent_dues); overdue is live (paid_through_date).
export const getLedgerSummary = unstable_cache(async function getLedgerSummary() {
  const S = schemas.ops;
  const res = await pool.query(`
    WITH hist AS (
      SELECT d.amount, d.period_start, ${PAID_FROM_BALANCE} AS paid
      FROM ${S}.rent_dues d
      JOIN ${S}.rider_vehicle_assignments a ON a.id = d.assignment_id
    ),
    live AS (
      -- Rent is billed weekly, so a display amount is always a whole week's rent —
      -- round up to the nearest week even if only partway into an unpaid one.
      SELECT CEIL((${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) / 7.0) * a.daily_rent * 7 AS overdue_amount
      FROM ${S}.rider_vehicle_assignments a
      WHERE a.status = 'active' AND COALESCE(a.paid_through_date, a.assigned_date - 1) < ${OVERDUE_CUTOFF}
    )
    SELECT
      (SELECT COALESCE(SUM(amount) FILTER (WHERE period_start < ${IST}), 0) FROM hist) AS expected_to_date,
      (SELECT COALESCE(SUM(LEAST(paid, amount)), 0) FROM hist) AS collected,
      (SELECT COALESCE(SUM(overdue_amount), 0) FROM live) AS overdue,
      (SELECT COUNT(*) FROM live) AS overdue_riders
  `);
  const r = res.rows[0];
  const expected = Number(r.expected_to_date), collected = Number(r.collected);
  return {
    expectedToDate: expected, collected, overdue: Number(r.overdue),
    overdueRiders: Number(r.overdue_riders),
    pct: expected > 0 ? Math.round((collected / expected) * 100) : 0,
  };
}, ["ledger-summary-v2"], { revalidate: 60 });

// Riders currently overdue — computed directly from paid_through_date, no rent_dues
// dependency (so it can never go stale relative to today). Shared everywhere.
// Displayed amount/weeks are rounded UP to whole weeks (rent is billed weekly) — the
// day-precise paid_through_date this is derived from stays exact internally.
export const getOverdueRiders = unstable_cache(async function getOverdueRiders() {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.rider_code, r.name, r.mobile,
      CEIL((${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) / 7.0) AS overdue_weeks,
      CEIL((${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) / 7.0) * a.daily_rent * 7 AS overdue_amount
    FROM ${S}.rider_vehicle_assignments a
    JOIN ${S}.riders r ON r.id = a.rider_id
    WHERE a.status = 'active' AND COALESCE(a.paid_through_date, a.assigned_date - 1) < ${OVERDUE_CUTOFF}
    ORDER BY overdue_amount DESC`);
  return res.rows.map((r) => ({
    rider_id: r.rider_id, rider_code: r.rider_code, name: r.name, mobile: r.mobile,
    overdue_weeks: Number(r.overdue_weeks), overdue_amount: Number(r.overdue_amount),
  }));
}, ["overdue-riders-v3"], { revalidate: 60 });

// Riders whose paid-through date lapses within the next 2 days (but aren't Overdue
// yet) — computed directly from paid_through_date. Shared everywhere.
export const getDueSoonRiders = unstable_cache(async function getDueSoonRiders() {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.rider_code, r.name, r.mobile,
      to_char(COALESCE(a.paid_through_date, a.assigned_date - 1) + 1, 'YYYY-MM-DD') AS next_due_date
    FROM ${S}.rider_vehicle_assignments a
    JOIN ${S}.riders r ON r.id = a.rider_id
    WHERE a.status = 'active'
      AND COALESCE(a.paid_through_date, a.assigned_date - 1) >= ${OVERDUE_CUTOFF}
      AND COALESCE(a.paid_through_date, a.assigned_date - 1) <= ${IST} + 2
    ORDER BY next_due_date ASC`);
  return res.rows.map((r) => ({
    rider_id: r.rider_id, rider_code: r.rider_code, name: r.name, mobile: r.mobile,
    next_due_date: r.next_due_date,
  }));
}, ["due-soon-riders-v2"], { revalidate: 60 });
