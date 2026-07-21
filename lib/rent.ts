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

// The rider's next due date, anchored on paid_through_date — their real payment
// rhythm (assigned_date goes stale after an issue-swap continuation). A rider paid
// through the 21st is due the 21st for the week starting the 22nd; the date holds
// through the 2-day grace after a miss, then rolls a week (due 7th, unpaid on the
// 9th → 14th). Never-paid riders anchor on the allotment date (week 1 due =
// assigned + 6). `a` is the rider_vehicle_assignments alias in the calling query.
export const nextDueSql = (a: string) => `
  (CASE WHEN COALESCE(${a}.paid_through_date, ${a}.assigned_date - 1) >= ${a}.assigned_date
    THEN ${a}.paid_through_date + 7 * CEIL(GREATEST(${IST} - 1 - ${a}.paid_through_date, 0) / 7.0)::int
    ELSE (${a}.assigned_date - 1) + 7 * GREATEST(1, CEIL(GREATEST(${IST} - ${a}.assigned_date, 0) / 7.0)::int)
  END)`;

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
  sheet_note: string | null; // free-text payment note from the ops rent sheet (e.g. "1300 rs Recieved | 730 pending")
};

// Full unbroken weekly cycle for one rider (across all their assignments) — per-week
// history for the rider profile page. Reads rent_dues for everything already generated,
// but ALSO synthesizes any week that's started (or is due to start within 2 days) but
// hasn't been written to rent_dues yet by the daily regeneration job — so a rider's
// current/upcoming week never goes missing just because that job hasn't run yet.
// Synthesized rows use the exact same math as getDueSoonRiders/getOverdueRiders, so a
// week appears here at the same moment it would in those lists (2 days before it starts,
// the same 2-day grace before Overdue), and are seamlessly replaced once rent_dues
// catches up (matched by period_start, so no duplicates).
export async function getRiderCycle(riderId: string): Promise<CycleWeek[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    WITH existing AS (
      SELECT d.assignment_id, d.week_no, d.period_start, d.period_end, d.due_date, d.amount
      FROM ${S}.rent_dues d
      WHERE d.rider_id = $1
    ),
    gaps AS (
      SELECT a.id AS assignment_id, a.daily_rent,
        COALESCE((SELECT MAX(e.period_end) FROM existing e WHERE e.assignment_id = a.id), a.assigned_date - 1) AS last_covered,
        COALESCE((SELECT MAX(e.week_no) FROM existing e WHERE e.assignment_id = a.id), 0) AS last_week_no
      FROM ${S}.rider_vehicle_assignments a
      WHERE a.rider_id = $1 AND a.status = 'active'
    ),
    synthesized AS (
      SELECT g.assignment_id,
        (g.last_week_no + row_number() OVER (PARTITION BY g.assignment_id ORDER BY gs))::int AS week_no,
        gs::date AS period_start, (gs::date + 6) AS period_end, (gs::date - 1) AS due_date,
        g.daily_rent * 7 AS amount
      FROM gaps g, LATERAL generate_series((g.last_covered + 1)::timestamp, (${IST} + 2)::timestamp, interval '7 days') AS gs
    ),
    weeks AS (
      SELECT * FROM existing
      UNION ALL
      SELECT * FROM synthesized
    )
    SELECT week_no, period_start, period_end,
      -- A Collected week's due date is forward-looking: the next payment lands on
      -- its period end (pay-day for the following week). Unpaid/partial weeks keep
      -- their own due date — that's the date being chased.
      CASE WHEN paid >= amount THEN period_end ELSE due_date END AS due_date,
      amount, paid, ev_number, vehicle_id, sheet_note,
      CASE WHEN paid >= amount THEN 'Collected'
           WHEN paid > 0 THEN 'Partial'
           WHEN asgn_status = 'active' AND ps_dt < ${OVERDUE_CUTOFF} THEN 'Overdue'
           ELSE 'Pending' END AS status
    FROM (
      SELECT w.week_no,
        to_char(w.period_start,'YYYY-MM-DD') AS period_start,
        to_char(w.period_end,'YYYY-MM-DD') AS period_end,
        -- Week 1 is paid on the allotment day itself — clamp the pay-in-advance
        -- "day before" so a fresh tenancy never shows a due date preceding it
        -- (covers old rent_dues rows and synthesized rows alike).
        to_char(CASE WHEN w.week_no = 1 THEN GREATEST(w.due_date, w.period_start) ELSE w.due_date END,'YYYY-MM-DD') AS due_date,
        w.period_start AS ps_dt, a.vehicle_id, a.status AS asgn_status,
        w.amount, a.sheet_note,
        GREATEST(0, LEAST(COALESCE(a.paid_through_date, a.assigned_date - 1), w.period_end) - w.period_start + 1) * a.daily_rent AS paid,
        v.ev_number, a.assigned_date
      FROM weeks w
      JOIN ${S}.rider_vehicle_assignments a ON a.id = w.assignment_id
      LEFT JOIN ${S}.vehicles v ON v.id = a.vehicle_id
    ) q
    ORDER BY assigned_date, period_start`, [riderId]);
  return res.rows.map((r) => ({
    week_no: r.week_no, period_start: r.period_start, period_end: r.period_end, due_date: r.due_date,
    amount: Number(r.amount), paid: Number(r.paid), status: r.status, ev_number: r.ev_number, vehicle_id: r.vehicle_id,
    sheet_note: r.sheet_note ?? null,
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
    ),
    -- Riders at least one full day past their paid-through date — their current
    -- payment-cycle week is running unpaid. Paid through today or beyond →
    -- hidden until tomorrow. One week's rent each; at most one week behind.
    -- Overlaps with 'live' by design (see getPendingThisWeekRiders).
    pending_week AS (
      SELECT a.daily_rent * 7 AS pending_amount
      FROM ${S}.rider_vehicle_assignments a
      WHERE a.status = 'active'
        AND COALESCE(a.paid_through_date, a.assigned_date - 1) BETWEEN ${IST} - 7 AND ${IST} - 1
    )
    SELECT
      (SELECT COALESCE(SUM(amount) FILTER (WHERE period_start < ${IST}), 0) FROM hist) AS expected_to_date,
      (SELECT COALESCE(SUM(LEAST(paid, amount)), 0) FROM hist) AS collected,
      (SELECT COALESCE(SUM(overdue_amount), 0) FROM live) AS overdue,
      (SELECT COUNT(*) FROM live) AS overdue_riders,
      (SELECT COALESCE(SUM(pending_amount), 0) FROM pending_week) AS pending_this_week,
      (SELECT COUNT(*) FROM pending_week) AS pending_this_week_riders
  `);
  const r = res.rows[0];
  const expected = Number(r.expected_to_date), collected = Number(r.collected);
  return {
    expectedToDate: expected, collected, overdue: Number(r.overdue),
    overdueRiders: Number(r.overdue_riders),
    pendingThisWeek: Number(r.pending_this_week),
    pendingThisWeekRiders: Number(r.pending_this_week_riders),
    pct: expected > 0 ? Math.round((collected / expected) * 100) : 0,
  };
}, ["ledger-summary-v6"], { revalidate: 60 });

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

// Riders whose next rental week starts within 2 days (but aren't Overdue yet) —
// computed directly from paid_through_date. Shared everywhere. Next week's
// period_start = paid_through_date + 1, so "starts within 2 days" means
// paid_through_date <= today + 1.
export const getDueSoonRiders = unstable_cache(async function getDueSoonRiders() {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.rider_code, r.name, r.mobile,
      to_char(COALESCE(a.paid_through_date, a.assigned_date - 1) + 1, 'YYYY-MM-DD') AS next_due_date
    FROM ${S}.rider_vehicle_assignments a
    JOIN ${S}.riders r ON r.id = a.rider_id
    WHERE a.status = 'active'
      AND COALESCE(a.paid_through_date, a.assigned_date - 1) >= ${OVERDUE_CUTOFF}
      AND COALESCE(a.paid_through_date, a.assigned_date - 1) <= ${IST} + 1
    ORDER BY next_due_date ASC`);
  return res.rows.map((r) => ({
    rider_id: r.rider_id, rider_code: r.rider_code, name: r.name, mobile: r.mobile,
    next_due_date: r.next_due_date,
  }));
}, ["due-soon-riders-v3"], { revalidate: 60 });

// The "collect this week" worklist: riders at least one full day past their
// paid-through date — their current payment-cycle week (paid_through + 1 …
// paid_through + 7) is running unpaid. A rider paid through today or beyond is
// hidden until tomorrow: pay-cycle weeks are anchored on paid_through_date, the
// rider's real payment rhythm (assigned_date goes stale after an issue-swap).
//   paid_through <= today - 1 → at least one unpaid day has elapsed
//   paid_through >= today - 7 → at most one week behind (deeper is Overdue-only)
// The amount is always exactly one week's rent (daily_rent * 7) — never past weeks.
// NOTE: this intentionally OVERLAPS with getOverdueRiders (which fires at >2 days past
// paid_through) — by design; Overdue is left as-is.
export const getPendingThisWeekRiders = unstable_cache(async function getPendingThisWeekRiders() {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.rider_code, r.name, r.mobile,
      a.daily_rent * 7 AS pending_amount,
      to_char(COALESCE(a.paid_through_date, a.assigned_date - 1) + 1, 'YYYY-MM-DD') AS week_start,
      to_char(COALESCE(a.paid_through_date, a.assigned_date - 1) + 7, 'YYYY-MM-DD') AS week_end
    FROM ${S}.rider_vehicle_assignments a
    JOIN ${S}.riders r ON r.id = a.rider_id
    WHERE a.status = 'active'
      AND COALESCE(a.paid_through_date, a.assigned_date - 1) BETWEEN ${IST} - 7 AND ${IST} - 1
    ORDER BY week_start ASC`);
  return res.rows.map((r) => ({
    rider_id: r.rider_id, rider_code: r.rider_code, name: r.name, mobile: r.mobile,
    pending_amount: Number(r.pending_amount), week_start: r.week_start, week_end: r.week_end,
  }));
}, ["pending-this-week-riders-v4"], { revalidate: 60 });
