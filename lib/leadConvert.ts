import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

// A rider-type lead auto-flips to 'converted' the moment that rider's KYC
// completes (submitted in the app, or documents verified by the team) —
// matched by 10-digit mobile core. Fire-and-forget: lead bookkeeping must
// never fail the KYC action itself.
export async function convertRiderLeadByMobile(mobile: string): Promise<void> {
  const core = String(mobile).replace(/\D/g, "").slice(-10);
  if (core.length !== 10) return;
  try {
    await pool.query(
      `UPDATE ${schemas.leads}.leads SET status = 'converted'
       WHERE type = 'rider' AND status <> 'converted'
         AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $1`,
      [core]
    );
  } catch {
    // leads schema hiccup shouldn't break KYC — silently skip.
  }
}
