import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { IST, nextDueSql, outstandingSql } from "@/lib/rent";

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

// ---------------------------------------------------------------------------
// Collections Call List (morning email): EVERY rider owing (T+1 onwards),
// worst first — the top of the list is the escalation view. Riders whose
// vehicle was recovered have no active assignment and are excluded by
// construction; their money lives in the bad-debt register.
export type CallListRow = {
  rider_id: string; rider_name: string; rider_code: string | null; mobile: string;
  ev_number: string | null; hub_name: string | null;
  days_behind: number; outstanding: number; next_due_date: string;
  last_payment_date: string | null; last_payment_amount: number | null;
  claim_pending: boolean; waiver_pending: boolean;
  daily_rent: number | null; rent_credit: number; allotment_code: string | null;
};

export async function getCallList(): Promise<CallListRow[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.name AS rider_name, r.rider_code, r.mobile,
      v.ev_number, h.hub_name, a.daily_rent, COALESCE(a.rent_credit, 0) AS rent_credit, a.allotment_code,
      (${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) AS days_behind,
      ${outstandingSql("a")} AS outstanding,
      to_char(${nextDueSql("a")}, 'YYYY-MM-DD') AS next_due_date,
      lp.d AS last_payment_date, lp.amt AS last_payment_amount,
      EXISTS (SELECT 1 FROM ${S}.payment_claims c WHERE c.rider_id = r.id AND c.status = 'pending') AS claim_pending,
      EXISTS (SELECT 1 FROM ${S}.rent_waiver_requests w WHERE w.rider_id = r.id AND w.status = 'pending') AS waiver_pending
    FROM ${S}.rider_vehicle_assignments a
    JOIN ${S}.riders r ON r.id = a.rider_id
    LEFT JOIN ${S}.vehicles v ON v.id = a.vehicle_id
    LEFT JOIN ${S}.hubs h ON h.id = v.hub_id
    LEFT JOIN LATERAL (
      SELECT to_char(p.payment_date, 'YYYY-MM-DD') AS d, p.amount_collected::int AS amt
      FROM ${S}.rider_payments p WHERE p.rider_id = r.id
      ORDER BY p.payment_date DESC, p.created_at DESC LIMIT 1
    ) lp ON true
    WHERE a.status = 'active'
      AND (${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) >= 1
    ORDER BY days_behind DESC, outstanding DESC`);
  return res.rows.map((r) => ({
    rider_id: r.rider_id, rider_name: r.rider_name, rider_code: r.rider_code, mobile: r.mobile,
    ev_number: r.ev_number, hub_name: r.hub_name,
    days_behind: Number(r.days_behind), outstanding: Math.round(Number(r.outstanding)),
    next_due_date: r.next_due_date,
    last_payment_date: r.last_payment_date, last_payment_amount: r.last_payment_amount == null ? null : Number(r.last_payment_amount),
    claim_pending: r.claim_pending === true, waiver_pending: r.waiver_pending === true,
    daily_rent: r.daily_rent == null ? null : Number(r.daily_rent), rent_credit: Math.round(Number(r.rent_credit)),
    allotment_code: r.allotment_code,
  }));
}

// Week-over-week block (evening email). Expected comes straight from assignment
// activity (days active in the window × daily rate) — independent of rent_dues.
// Riders-behind-then prefers the exact snapshot when one exists for that date,
// else reconstructs from payment windows (approximate around waivers).
export type WowBlock = {
  collectedThisWeek: number; collectedLastWeek: number;
  expectedThisWeek: number; ratePct: number;
  ridersOwingNow: number; ridersOwingWeekAgo: number | null; weekAgoExact: boolean;
  newDefaulters: number; cured: number;
  badDebtAddedThisWeek: number; badDebtOutstanding: number;
};

export async function getWowBlock(): Promise<WowBlock> {
  const S = schemas.ops;
  const [pay, expected, owing, recon, badDebt, snapshot] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(SUM(amount_collected) FILTER (WHERE payment_date > ${IST} - 7), 0)::int AS this_week,
        COALESCE(SUM(amount_collected) FILTER (WHERE payment_date <= ${IST} - 7 AND payment_date > ${IST} - 14), 0)::int AS last_week
      FROM ${S}.rider_payments`),
    pool.query(`
      SELECT COALESCE(SUM(
        GREATEST(0, LEAST(${IST}, COALESCE(a.returned_date, ${IST})) - GREATEST(${IST} - 6, a.assigned_date) + 1) * a.daily_rent
      ), 0)::int AS expected
      FROM ${S}.rider_vehicle_assignments a
      WHERE a.assigned_date <= ${IST} AND COALESCE(a.returned_date, ${IST}) >= ${IST} - 6`),
    pool.query(`
      SELECT COUNT(*)::int AS n FROM ${S}.rider_vehicle_assignments a
      WHERE a.status = 'active' AND (${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) >= 1`),
    pool.query(`
      WITH x AS (
        SELECT COALESCE(a.paid_through_date, a.assigned_date - 1) AS pt_now,
          COALESCE(a.paid_through_date, a.assigned_date - 1)
            - COALESCE((SELECT SUM(p.rental_period_end - p.rental_period_start)::int
                        FROM ${S}.rider_payments p
                        WHERE p.rider_id = a.rider_id AND p.payment_date > ${IST} - 7), 0) AS pt_then,
          a.assigned_date
        FROM ${S}.rider_vehicle_assignments a WHERE a.status = 'active'
      )
      SELECT
        COUNT(*) FILTER (WHERE assigned_date <= ${IST} - 7 AND pt_then >= (${IST} - 7) - 2 AND pt_now < ${IST} - 2)::int AS new_defaulters,
        COUNT(*) FILTER (WHERE assigned_date <= ${IST} - 7 AND pt_then < (${IST} - 7) - 2 AND pt_now >= ${IST} - 2)::int AS cured,
        COUNT(*) FILTER (WHERE assigned_date <= ${IST} - 7 AND pt_then < ${IST} - 7)::int AS owing_then_recon
      FROM x`),
    pool.query(`
      SELECT
        COALESCE(SUM(d.original_outstanding) FILTER (WHERE d.created_at > now() - interval '7 days'), 0)::int AS added_week,
        COALESCE(SUM(d.original_outstanding), 0)::int
          - COALESCE((SELECT SUM(p.amount) FROM ${S}.bad_debt_payments p), 0)::int AS outstanding
      FROM ${S}.bad_debts d`),
    pool.query(`SELECT riders_owing FROM ${S}.report_snapshots WHERE snapshot_date = ${IST} - 7`),
  ]);

  const expectedThisWeek = Number(expected.rows[0].expected);
  const collectedThisWeek = Number(pay.rows[0].this_week);
  return {
    collectedThisWeek,
    collectedLastWeek: Number(pay.rows[0].last_week),
    expectedThisWeek,
    ratePct: expectedThisWeek > 0 ? Math.round((collectedThisWeek / expectedThisWeek) * 100) : 0,
    ridersOwingNow: Number(owing.rows[0].n),
    ridersOwingWeekAgo: snapshot.rows[0] ? Number(snapshot.rows[0].riders_owing) : Number(recon.rows[0].owing_then_recon),
    weekAgoExact: !!snapshot.rows[0],
    newDefaulters: Number(recon.rows[0].new_defaulters),
    cured: Number(recon.rows[0].cured),
    badDebtAddedThisWeek: Number(badDebt.rows[0].added_week),
    badDebtOutstanding: Math.max(0, Number(badDebt.rows[0].outstanding)),
  };
}

// Daily snapshot written by the evening job — after a week these make the WoW
// comparisons exact.
export async function writeDailySnapshot(): Promise<void> {
  const S = schemas.ops;
  await pool.query(`
    INSERT INTO ${S}.report_snapshots (snapshot_date, riders_owing, outstanding_total, collected_7d, expected_7d, bad_debt_total)
    SELECT ${IST},
      (SELECT COUNT(*) FROM ${S}.rider_vehicle_assignments a
        WHERE a.status = 'active' AND (${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1)) >= 1),
      (SELECT COALESCE(SUM(${outstandingSql("a")}), 0) FROM ${S}.rider_vehicle_assignments a WHERE a.status = 'active'),
      (SELECT COALESCE(SUM(amount_collected), 0) FROM ${S}.rider_payments WHERE payment_date > ${IST} - 7),
      (SELECT COALESCE(SUM(
         GREATEST(0, LEAST(${IST}, COALESCE(a.returned_date, ${IST})) - GREATEST(${IST} - 6, a.assigned_date) + 1) * a.daily_rent), 0)
       FROM ${S}.rider_vehicle_assignments a
       WHERE a.assigned_date <= ${IST} AND COALESCE(a.returned_date, ${IST}) >= ${IST} - 6),
      (SELECT COALESCE(SUM(d.original_outstanding), 0) - COALESCE((SELECT SUM(p.amount) FROM ${S}.bad_debt_payments p), 0)
       FROM ${S}.bad_debts d)
    ON CONFLICT (snapshot_date) DO UPDATE SET
      riders_owing = EXCLUDED.riders_owing, outstanding_total = EXCLUDED.outstanding_total,
      collected_7d = EXCLUDED.collected_7d, expected_7d = EXCLUDED.expected_7d,
      bad_debt_total = EXCLUDED.bad_debt_total`);
}
