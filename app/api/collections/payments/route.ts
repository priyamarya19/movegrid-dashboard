import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { getHubScope, hubScopeSql } from "@/lib/hubScope";
import { rangeCondition } from "@/lib/dateRange";

// GET /api/collections/payments — every rent collection received (independent of
// whether the allotment is still active), optionally filtered by the date the
// payment was received (?range=today|yesterday|last7|mtd, or ?from=&to=).
// Visible to every ops role (admin / ops_manager / hub_incharge).
export async function GET(req: NextRequest) {
  // Role gate only — see the chase route: payments received is core ops data,
  // not something each user needs toggled on individually.
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const dateWhere = rangeCondition("rp.payment_date", searchParams.get("range"), searchParams.get("from"), searchParams.get("to"));
  const S = schemas.ops;
  const scope = await getHubScope(guard.session.userId, guard.session.role);
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.rider_code, r.name,
      v.id AS vehicle_id, v.ev_number,
      rp.amount_collected, rp.payment_mode,
      to_char(rp.payment_date, 'YYYY-MM-DD') AS payment_date,
      to_char(rp.rental_period_start, 'YYYY-MM-DD') AS period_start,
      to_char(rp.rental_period_end, 'YYYY-MM-DD') AS period_end
    FROM ${S}.rider_payments rp
    JOIN ${S}.riders r ON r.id = rp.rider_id
    LEFT JOIN ${S}.vehicles v ON v.id = rp.vehicle_id
    WHERE ${dateWhere}${hubScopeSql(scope, "v.hub_id")}
    ORDER BY rp.payment_date DESC, r.name ASC`);
  const total = res.rows.reduce((sum, p) => sum + Number(p.amount_collected), 0);
  return NextResponse.json({ payments: res.rows, total });
}
