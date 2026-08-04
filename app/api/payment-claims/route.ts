import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { getHubScope, hubScopeSql } from "@/lib/hubScope";
import { outstandingSql } from "@/lib/rent";

// GET /api/payment-claims — the verification queue: every pending rider payment
// claim with reviewer context (the rider's live outstanding, so the amount can
// be sanity-checked at a glance). Anyone who can record payments can verify
// (admin, ops_manager, hub_incharge).
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const scope = await getHubScope(guard.session.userId, guard.session.role);

  const res = await pool.query(`
    SELECT c.id, c.amount::int AS amount, c.utr, c.screenshot_url,
      to_char(c.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS submitted_at,
      EXTRACT(EPOCH FROM (now() - c.created_at))::int / 3600 AS age_hours,
      r.id AS rider_id, r.name AS rider_name, r.rider_code, r.mobile,
      v.ev_number,
      COALESCE(${outstandingSql("a")}, 0)::int AS outstanding_now
    FROM ${schemas.ops}.payment_claims c
    JOIN ${schemas.ops}.riders r ON r.id = c.rider_id
    LEFT JOIN ${schemas.ops}.rider_vehicle_assignments a ON a.rider_id = r.id AND a.status = 'active'
    LEFT JOIN ${schemas.ops}.vehicles v ON v.id = a.vehicle_id
    WHERE c.status = 'pending'${hubScopeSql(scope, "a.hub_id")}
    ORDER BY c.created_at ASC`);
  return NextResponse.json({ claims: res.rows });
}
