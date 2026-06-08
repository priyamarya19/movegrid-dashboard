import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { computeImpact, type Impact } from "@/lib/impact";

/** The fixed payout plan: capital is returned to the investor over this many months. */
export const PAYOUT_TERM_MONTHS = 24;

/** Format a number of months as a short tenure label, e.g. "1 yr 3 mo". */
export function formatTenure(months: number): string {
  if (months <= 0) return "New";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} mo`;
  if (m === 0) return `${y} yr`;
  return `${y} yr ${m} mo`;
}

export type PortfolioVehicle = {
  id: string;
  ev_number: string;
  status: string;
  model_name: string | null;
  oem: string | null;
  hub_name: string | null;
  assigned_rider: string | null;
  rider_id: string | null;
  rider_mobile: string | null;
  rider_aadhaar: string | null;
};

export type PortfolioPayout = {
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: string;
  ev_number: string | null;
  period_month: string | null;
  proof_url: string | null;
};

export type Portfolio = {
  profile: {
    id: string;
    total_invested: number;
    investment_date: string | null;
    status: string;
    pan: string | null;
    aadhaar: string | null;
    aadhaar_url: string | null;
    bank: string | null;
    ifsc: string | null;
    account_number: string | null;
    bank_status: string;
  };
  vehicles: PortfolioVehicle[];
  payouts: PortfolioPayout[];
  totalPaid: number;
  totalPending: number;
  roi: number;
  impact: Impact;
  tenureMonths: number;
  payoutsMade: number;
  payoutsRemaining: number;
  termMonths: number;
  nextDueDate: string | null;
};

/**
 * Loads the portfolio for the logged-in investor, scoped by their user id.
 * `investor_profiles.user_id` links the auth user to their investor profile;
 * vehicles and payouts reference `investor_profiles.id` (not the user id).
 * Returns null when the user has no investor profile yet.
 */
export async function getPortfolioByUser(userId: string): Promise<Portfolio | null> {
  const profileResult = await pool.query(
    `SELECT id, total_invested, investment_date, status, pan, aadhaar, aadhaar_url,
            bank, ifsc, account_number, bank_status
     FROM ${schemas.ops}.investor_profiles
     WHERE user_id = $1`,
    [userId]
  );

  const profile = profileResult.rows[0];
  if (!profile) return null;

  const [vehicles, payouts, running] = await Promise.all([
    pool.query(
      `SELECT v.id, v.ev_number, v.status,
              m.model_name, m.oem,
              h.hub_name,
              r.name AS assigned_rider, r.id AS rider_id,
              r.mobile AS rider_mobile, r.aadhaar AS rider_aadhaar
       FROM ${schemas.ops}.vehicles v
       LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
       LEFT JOIN ${schemas.ops}.hubs h ON h.id = v.hub_id
       LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.vehicle_id = v.id AND rva.status = 'active'
       LEFT JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
       WHERE v.investor_id = $1
       ORDER BY v.ev_number`,
      [profile.id]
    ),
    pool.query(
      `SELECT pay.amount, pay.due_date, pay.paid_date, pay.status, pay.period_month, pay.proof_url, v.ev_number
       FROM ${schemas.ops}.investor_payouts pay
       LEFT JOIN ${schemas.ops}.vehicles v ON v.id = pay.vehicle_id
       WHERE pay.investor_id = $1
       ORDER BY COALESCE(pay.period_month, pay.due_date) DESC`,
      [profile.id]
    ),
    // Total running days across this investor's scooters: for each allotment,
    // days from allotment to its return (or today if still running).
    pool.query(
      `SELECT COALESCE(SUM(
                GREATEST(0, COALESCE(rva.returned_date, CURRENT_DATE) - rva.assigned_date)
              ), 0)::int AS total_days
       FROM ${schemas.ops}.vehicles v
       JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.vehicle_id = v.id
       WHERE v.investor_id = $1`,
      [profile.id]
    ),
  ]);

  const totalPaid = payouts.rows
    .filter((p: { status: string }) => p.status === "paid")
    .reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
  const totalPending = payouts.rows
    .filter((p: { status: string }) => p.status === "pending")
    .reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
  const roi =
    Number(profile.total_invested) > 0
      ? (totalPaid / Number(profile.total_invested)) * 100
      : 0;

  const impact = computeImpact(Number(running.rows[0]?.total_days ?? 0));

  // Number of distinct months actually paid out (each month = one of the 24 payouts).
  const paidMonths = new Set<string>();
  for (const p of payouts.rows as PortfolioPayout[]) {
    if (p.status !== "paid") continue;
    const d = p.period_month ?? p.due_date;
    if (!d) continue;
    paidMonths.add(new Date(d).toISOString().slice(0, 7)); // YYYY-MM
  }
  const payoutsMade = paidMonths.size;
  const payoutsRemaining = Math.max(0, PAYOUT_TERM_MONTHS - payoutsMade);

  const invDate = profile.investment_date ? new Date(profile.investment_date) : null;
  const now = new Date();
  const tenureMonths = invDate
    ? Math.max(0, (now.getFullYear() - invDate.getFullYear()) * 12 + (now.getMonth() - invDate.getMonth()))
    : 0;

  // Next payout is due on the 10th of next month (while payouts remain).
  let nextDueDate: string | null = null;
  if (payoutsRemaining > 0) {
    const due = new Date(now.getFullYear(), now.getMonth() + 1, 10);
    nextDueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-10`;
  }

  return {
    profile,
    vehicles: vehicles.rows,
    payouts: payouts.rows,
    totalPaid,
    totalPending,
    roi,
    impact,
    tenureMonths,
    payoutsMade,
    payoutsRemaining,
    termMonths: PAYOUT_TERM_MONTHS,
    nextDueDate,
  };
}
