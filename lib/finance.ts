import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

const IST = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

export type FinanceBuckets = {
  tillDate: number; mtd: number; lmtd: number; today: number; yesterday: number; lastWeek: number;
};

export type FinanceSummary = {
  total: FinanceBuckets;
  bySource: { rent: FinanceBuckets; penalties: FinanceBuckets; feesDeposits: FinanceBuckets };
};

const emptyBuckets = (): FinanceBuckets => ({ tillDate: 0, mtd: 0, lmtd: 0, today: 0, yesterday: 0, lastWeek: 0 });

// Combined money-in summary across rent payments, paid penalties, and onboarding
// fee + security deposit (dated by the rider's first-ever vehicle allotment — that's
// when those two are actually collected). Buckets: Till Date / MTD / LMTD (same
// calendar-day cutoff, previous month) / Today / Yesterday / Last Week (trailing 7 days).
export async function getFinanceSummary(): Promise<FinanceSummary> {
  const S = schemas.ops;
  const res = await pool.query(`
    WITH bounds AS (
      SELECT ${IST} AS today, (${IST} - 1) AS yesterday, (${IST} - 6) AS last_week_start,
        date_trunc('month', ${IST})::date AS mtd_start,
        (date_trunc('month', ${IST}) - interval '1 month')::date AS lmtd_start,
        (date_trunc('month', ${IST}) - interval '1 month'
          + ((${IST} - date_trunc('month', ${IST})::date)) * interval '1 day')::date AS lmtd_end
    ),
    dated AS (
      SELECT payment_date AS d, amount_collected AS amount, 'rent' AS source
      FROM ${S}.rider_payments
      UNION ALL
      SELECT paid_at::date AS d, amount, 'penalties' AS source
      FROM ${S}.rider_penalties
      WHERE status = 'paid' AND amount IS NOT NULL
      UNION ALL
      SELECT fa.assigned_date AS d, (COALESCE(r.onboarding_fee, 0) + COALESCE(r.security_deposit, 0)) AS amount,
        'feesDeposits' AS source
      FROM ${S}.riders r
      JOIN LATERAL (
        SELECT MIN(assigned_date) AS assigned_date
        FROM ${S}.rider_vehicle_assignments WHERE rider_id = r.id
      ) fa ON fa.assigned_date IS NOT NULL
      WHERE (COALESCE(r.onboarding_fee, 0) + COALESCE(r.security_deposit, 0)) > 0
    )
    SELECT source,
      COALESCE(SUM(amount), 0) AS till_date,
      COALESCE(SUM(amount) FILTER (WHERE d >= b.mtd_start), 0) AS mtd,
      COALESCE(SUM(amount) FILTER (WHERE d >= b.lmtd_start AND d <= b.lmtd_end), 0) AS lmtd,
      COALESCE(SUM(amount) FILTER (WHERE d = b.today), 0) AS today,
      COALESCE(SUM(amount) FILTER (WHERE d = b.yesterday), 0) AS yesterday,
      COALESCE(SUM(amount) FILTER (WHERE d >= b.last_week_start), 0) AS last_week
    FROM dated, bounds b
    GROUP BY source
  `);

  const bySource = { rent: emptyBuckets(), penalties: emptyBuckets(), feesDeposits: emptyBuckets() };
  const total = emptyBuckets();
  for (const row of res.rows) {
    const bucket: FinanceBuckets = {
      tillDate: Number(row.till_date), mtd: Number(row.mtd), lmtd: Number(row.lmtd),
      today: Number(row.today), yesterday: Number(row.yesterday), lastWeek: Number(row.last_week),
    };
    bySource[row.source as keyof typeof bySource] = bucket;
    (Object.keys(bucket) as (keyof FinanceBuckets)[]).forEach((k) => { total[k] += bucket[k]; });
  }
  return { total, bySource };
}

export type FinanceDetailRow = {
  date: string; source: "Rent" | "Penalty" | "Onboarding Fee + Deposit";
  rider_name: string; amount: number;
};

// Row-level detail behind the summary — for the Excel download on the Finance page.
export async function getFinanceDetailRows(): Promise<FinanceDetailRow[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT to_char(p.payment_date, 'YYYY-MM-DD') AS date, 'Rent' AS source, r.name AS rider_name, p.amount_collected AS amount
    FROM ${S}.rider_payments p JOIN ${S}.riders r ON r.id = p.rider_id
    UNION ALL
    SELECT to_char(pen.paid_at::date, 'YYYY-MM-DD') AS date, 'Penalty' AS source, r.name AS rider_name, pen.amount
    FROM ${S}.rider_penalties pen JOIN ${S}.riders r ON r.id = pen.rider_id
    WHERE pen.status = 'paid' AND pen.amount IS NOT NULL
    UNION ALL
    SELECT to_char(fa.assigned_date, 'YYYY-MM-DD') AS date, 'Onboarding Fee + Deposit' AS source, r.name AS rider_name,
      (COALESCE(r.onboarding_fee, 0) + COALESCE(r.security_deposit, 0)) AS amount
    FROM ${S}.riders r
    JOIN LATERAL (
      SELECT MIN(assigned_date) AS assigned_date
      FROM ${S}.rider_vehicle_assignments WHERE rider_id = r.id
    ) fa ON fa.assigned_date IS NOT NULL
    WHERE (COALESCE(r.onboarding_fee, 0) + COALESCE(r.security_deposit, 0)) > 0
    ORDER BY date DESC
  `);
  return res.rows.map((r) => ({ date: r.date, source: r.source, rider_name: r.rider_name, amount: Number(r.amount) }));
}

export type FinanceSourceKey = "rent" | "penalties" | "feesDeposits" | "total";
export type FinanceBucketKey = keyof FinanceBuckets;

export type FinanceCellDetailRow = FinanceDetailRow & { rider_id: string };

// Row-level detail behind one summary cell — for the "click a cell, see who paid" drill-down.
export async function getFinanceDetailForCell(
  source: FinanceSourceKey,
  bucket: FinanceBucketKey
): Promise<FinanceCellDetailRow[]> {
  const S = schemas.ops;
  const bucketCond: Record<FinanceBucketKey, string> = {
    tillDate: "true",
    mtd: "d >= b.mtd_start",
    lmtd: "d >= b.lmtd_start AND d <= b.lmtd_end",
    today: "d = b.today",
    yesterday: "d = b.yesterday",
    lastWeek: "d >= b.last_week_start",
  };
  const res = await pool.query(`
    WITH bounds AS (
      SELECT ${IST} AS today, (${IST} - 1) AS yesterday, (${IST} - 6) AS last_week_start,
        date_trunc('month', ${IST})::date AS mtd_start,
        (date_trunc('month', ${IST}) - interval '1 month')::date AS lmtd_start,
        (date_trunc('month', ${IST}) - interval '1 month'
          + ((${IST} - date_trunc('month', ${IST})::date)) * interval '1 day')::date AS lmtd_end
    ),
    dated AS (
      SELECT p.payment_date AS d, p.amount_collected AS amount, 'rent' AS source, r.id AS rider_id, r.name AS rider_name
      FROM ${S}.rider_payments p JOIN ${S}.riders r ON r.id = p.rider_id
      UNION ALL
      SELECT pen.paid_at::date AS d, pen.amount, 'penalties' AS source, r.id AS rider_id, r.name AS rider_name
      FROM ${S}.rider_penalties pen JOIN ${S}.riders r ON r.id = pen.rider_id
      WHERE pen.status = 'paid' AND pen.amount IS NOT NULL
      UNION ALL
      SELECT fa.assigned_date AS d, (COALESCE(r.onboarding_fee, 0) + COALESCE(r.security_deposit, 0)) AS amount,
        'feesDeposits' AS source, r.id AS rider_id, r.name AS rider_name
      FROM ${S}.riders r
      JOIN LATERAL (
        SELECT MIN(assigned_date) AS assigned_date
        FROM ${S}.rider_vehicle_assignments WHERE rider_id = r.id
      ) fa ON fa.assigned_date IS NOT NULL
      WHERE (COALESCE(r.onboarding_fee, 0) + COALESCE(r.security_deposit, 0)) > 0
    )
    SELECT to_char(d, 'YYYY-MM-DD') AS date, source, rider_id, rider_name, amount
    FROM dated, bounds b
    WHERE (${source === "total" ? "true" : "source = $1"})
      AND (${bucketCond[bucket]})
    ORDER BY d DESC
  `, source === "total" ? [] : [source]);

  const sourceLabel: Record<string, FinanceDetailRow["source"]> = {
    rent: "Rent", penalties: "Penalty", feesDeposits: "Onboarding Fee + Deposit",
  };
  return res.rows.map((r) => ({
    date: r.date, source: sourceLabel[r.source], rider_id: r.rider_id, rider_name: r.rider_name, amount: Number(r.amount),
  }));
}
