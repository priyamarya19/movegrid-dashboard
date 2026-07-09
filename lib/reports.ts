import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { IST } from "@/lib/rent";

export type FleetRentStatusRow = {
  ev_number: string;
  hub_name: string | null;
  rider_name: string;
  mobile: string;
  onboarding_fee: number | null;
  security_deposit: number | null;
  total_paid: number;
  weekly_rent: number | null;
  next_due_date: string | null;
  pending_amount: number;
  overdue_amount: number;
};

// One row per active assignment — the daily "who has which vehicle, what have they
// paid, what's next due" snapshot emailed to ops. Computed directly from
// paid_through_date (see lib/rent.ts) — same source every dashboard/report uses.
export async function getFleetRentStatusReport(): Promise<FleetRentStatusRow[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    WITH q AS (
      SELECT a.id AS assignment_id, a.rider_id, a.daily_rent,
        COALESCE(a.paid_through_date, a.assigned_date - 1) AS paid_through,
        (${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) AS days_behind
      FROM ${S}.rider_vehicle_assignments a
      WHERE a.status = 'active'
    ),
    paid_total AS (
      SELECT rider_id, COALESCE(SUM(amount_collected), 0) AS total_paid
      FROM ${S}.rider_payments
      GROUP BY rider_id
    )
    SELECT v.ev_number, h.hub_name,
      r.name AS rider_name, r.mobile, r.onboarding_fee, r.security_deposit,
      COALESCE(pt.total_paid, 0) AS total_paid,
      (q.daily_rent * 7) AS weekly_rent,
      to_char(q.paid_through + 1, 'YYYY-MM-DD') AS next_due_date,
      -- Rent is billed weekly — round up to a whole week even if only partway into
      -- an unpaid one (paid_through_date itself stays day-precise internally).
      CASE WHEN q.days_behind > 0 AND q.days_behind <= 2 THEN CEIL(q.days_behind / 7.0) * q.daily_rent * 7 ELSE 0 END AS pending_amount,
      CASE WHEN q.days_behind > 2 THEN CEIL(q.days_behind / 7.0) * q.daily_rent * 7 ELSE 0 END AS overdue_amount
    FROM q
    JOIN ${S}.rider_vehicle_assignments a ON a.id = q.assignment_id
    JOIN ${S}.riders r ON r.id = a.rider_id
    JOIN ${S}.vehicles v ON v.id = a.vehicle_id
    LEFT JOIN ${S}.hubs h ON h.id = v.hub_id
    LEFT JOIN paid_total pt ON pt.rider_id = a.rider_id
    ORDER BY h.hub_name NULLS LAST, v.ev_number
  `);
  return res.rows.map((r) => ({
    ev_number: r.ev_number,
    hub_name: r.hub_name,
    rider_name: r.rider_name,
    mobile: r.mobile,
    onboarding_fee: r.onboarding_fee === null ? null : Number(r.onboarding_fee),
    security_deposit: r.security_deposit === null ? null : Number(r.security_deposit),
    total_paid: Number(r.total_paid),
    weekly_rent: r.weekly_rent === null ? null : Number(r.weekly_rent),
    next_due_date: r.next_due_date,
    pending_amount: Number(r.pending_amount),
    overdue_amount: Number(r.overdue_amount),
  }));
}

export type RentDueRow = {
  rider_id: string;
  rider_name: string;
  mobile: string;
  ev_number: string | null;
  hub_name: string | null;
  amount_due: number;
  due_label: "Today" | "Tomorrow" | "Overdue";
};

// Riders due today/tomorrow (paid-through date lapsing) plus already-overdue riders —
// the 9 AM ops alert. Same paid_through_date source as everywhere else.
export async function getRentDueAlert(): Promise<RentDueRow[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.name AS rider_name, r.mobile, v.ev_number, h.hub_name,
      -- Whole weeks, not day-prorated — rent is billed weekly.
      CEIL(GREATEST(days_behind, 1) / 7.0) * a.daily_rent * 7 AS amount_due,
      CASE WHEN days_behind > 2 THEN 'Overdue' WHEN days_behind = 1 THEN 'Today' ELSE 'Tomorrow' END AS due_label
    FROM (
      SELECT a.*, (${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) AS days_behind
      FROM ${S}.rider_vehicle_assignments a WHERE a.status = 'active'
    ) a
    JOIN ${S}.riders r ON r.id = a.rider_id
    LEFT JOIN ${S}.vehicles v ON v.id = a.vehicle_id
    LEFT JOIN ${S}.hubs h ON h.id = v.hub_id
    WHERE days_behind > 2 OR days_behind IN (0, 1)
    ORDER BY CASE WHEN days_behind > 2 THEN 0 WHEN days_behind = 1 THEN 1 ELSE 2 END, r.name
  `);
  return res.rows.map((r) => ({
    rider_id: r.rider_id,
    rider_name: r.rider_name,
    mobile: r.mobile,
    ev_number: r.ev_number,
    hub_name: r.hub_name,
    amount_due: Number(r.amount_due),
    due_label: r.due_label,
  }));
}
