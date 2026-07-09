import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";

// Single source of truth for the financial headline numbers (rent MTD, investments,
// payouts) — any dashboard/role that needs these calls this same function instead of
// re-querying. Currently shown on AdminHome; reusable as-is for any future role.
export const getFinancialStats = unstable_cache(async function getFinancialStats() {
  const S = schemas.ops;
  const [rentMTD, onboardMTD, securityMTD, totalCollected, totalInvestments, payoutsDone, payoutsPending] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(amount_collected),0) AS total FROM ${S}.rider_payments WHERE DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(onboarding_fee),0) AS total FROM ${S}.riders WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(security_deposit),0) AS total FROM ${S}.riders WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(amount_collected),0) AS total FROM ${S}.rider_payments`),
    pool.query(`SELECT COALESCE(SUM(total_invested),0) AS total FROM ${S}.investor_profiles`),
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM ${S}.investor_payouts WHERE status = 'paid'`),
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM ${S}.investor_payouts WHERE status = 'pending'`),
  ]);
  return {
    rentMTD: Number(rentMTD.rows[0].total),
    onboardMTD: Number(onboardMTD.rows[0].total),
    securityMTD: Number(securityMTD.rows[0].total),
    totalCollected: Number(totalCollected.rows[0].total),
    totalInvestments: Number(totalInvestments.rows[0].total),
    payoutsDone: Number(payoutsDone.rows[0].total),
    payoutsPending: Number(payoutsPending.rows[0].total),
  };
}, ["financial-stats-v1"], { revalidate: 60 });
