import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";

// Single source of truth for rent numbers. Every dashboard (admin/ops/investor) and the
// rider page read from here, so figures are identical everywhere.
//
// The ledger is rent_dues: one row per rider per week from allotment -> return (or today),
// with NO gaps. Status is computed live from matched payments + due_date.

const IST = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

// A payment counts toward a week if its payment_date OR its rental_period_start falls in that week.
const PAID_SUBQ = (S: string) => `
  COALESCE((SELECT SUM(rp.amount_collected) FROM ${S}.rider_payments rp
    WHERE rp.rider_id = d.rider_id
      AND (rp.payment_date BETWEEN d.period_start AND d.period_end
        OR rp.rental_period_start BETWEEN d.period_start AND d.period_end)), 0)`;

const STATUS_EXPR = `
  CASE WHEN paid >= amount THEN 'Collected'
       WHEN paid > 0 THEN 'Partial'
       WHEN due_date < ${IST} THEN 'Overdue'
       ELSE 'Pending' END`;

export type CycleWeek = {
  week_no: number; period_start: string; period_end: string; due_date: string;
  amount: number; paid: number; status: string; ev_number: string | null;
};

// Full unbroken weekly cycle for one rider (across all their assignments).
export async function getRiderCycle(riderId: string): Promise<CycleWeek[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT week_no, period_start, period_end, due_date, amount, paid, ev_number,
      CASE WHEN paid >= amount THEN 'Collected'
           WHEN paid > 0 THEN 'Partial'
           WHEN due_dt < ${IST} THEN 'Overdue'
           ELSE 'Pending' END AS status
    FROM (
      SELECT d.week_no,
        to_char(d.period_start,'YYYY-MM-DD') AS period_start,
        to_char(d.period_end,'YYYY-MM-DD') AS period_end,
        to_char(d.due_date,'YYYY-MM-DD') AS due_date,
        d.due_date AS due_dt,
        d.amount, ${PAID_SUBQ(S)} AS paid, v.ev_number, a.assigned_date
      FROM ${S}.rent_dues d
      JOIN ${S}.rider_vehicle_assignments a ON a.id = d.assignment_id
      LEFT JOIN ${S}.vehicles v ON v.id = d.vehicle_id
      WHERE d.rider_id = $1
    ) q
    ORDER BY assigned_date, period_start`, [riderId]);
  return res.rows.map((r) => ({
    week_no: r.week_no, period_start: r.period_start, period_end: r.period_end, due_date: r.due_date,
    amount: Number(r.amount), paid: Number(r.paid), status: r.status, ev_number: r.ev_number,
  }));
}

// All-time ledger summary — the headline numbers shared by every dashboard.
export const getLedgerSummary = unstable_cache(async function getLedgerSummary() {
  const S = schemas.ops;
  const res = await pool.query(`
    WITH q AS (
      SELECT d.amount, d.due_date, ${PAID_SUBQ(S)} AS paid FROM ${S}.rent_dues d
    )
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE due_date <= ${IST}), 0) AS expected_to_date,
      COALESCE(SUM(LEAST(paid, amount)), 0) AS collected,
      COALESCE(SUM(amount) FILTER (WHERE due_date < ${IST} AND paid < amount), 0) AS overdue,
      COUNT(*) FILTER (WHERE due_date < ${IST} AND paid < amount) AS overdue_weeks
    FROM q`);
  const r = res.rows[0];
  const expected = Number(r.expected_to_date), collected = Number(r.collected);
  return {
    expectedToDate: expected, collected, overdue: Number(r.overdue),
    overdueWeeks: Number(r.overdue_weeks),
    pct: expected > 0 ? Math.round((collected / expected) * 100) : 0,
  };
}, ["ledger-summary-v1"], { revalidate: 60 });

// Riders with overdue weeks — for the overdue list / reminders. Shared everywhere.
export const getOverdueRiders = unstable_cache(async function getOverdueRiders() {
  const S = schemas.ops;
  const res = await pool.query(`
    WITH q AS (
      SELECT d.rider_id, d.amount, d.due_date, ${PAID_SUBQ(S)} AS paid FROM ${S}.rent_dues d
    )
    SELECT r.id AS rider_id, r.rider_code, r.name, r.mobile,
      COUNT(*) FILTER (WHERE due_date < ${IST} AND paid < amount) AS overdue_weeks,
      COALESCE(SUM(amount - LEAST(paid, amount)) FILTER (WHERE due_date < ${IST} AND paid < amount), 0) AS overdue_amount
    FROM q JOIN ${S}.riders r ON r.id = q.rider_id
    GROUP BY r.id, r.rider_code, r.name, r.mobile
    HAVING COUNT(*) FILTER (WHERE due_date < ${IST} AND paid < amount) > 0
    ORDER BY overdue_amount DESC`);
  return res.rows.map((r) => ({
    rider_id: r.rider_id, rider_code: r.rider_code, name: r.name, mobile: r.mobile,
    overdue_weeks: Number(r.overdue_weeks), overdue_amount: Number(r.overdue_amount),
  }));
}, ["overdue-riders-v1"], { revalidate: 60 });
