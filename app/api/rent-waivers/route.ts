import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireSession } from "@/lib/auth";

// can_approve_rent_waivers is a per-user permission independent of role, so it can't
// live in the JWT (it can change mid-session) — look it up fresh on every request.
async function canApprove(userId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT can_approve_rent_waivers FROM ${schemas.auth}.users WHERE id = $1`,
    [userId]
  );
  return res.rows[0]?.can_approve_rent_waivers === true;
}

// List pending rent waiver requests. Also doubles as the "am I authorized" check the
// dashboard banner uses — a 403 here means the banner renders nothing.
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  if (!(await canApprove(guard.session.userId))) {
    return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  const res = await pool.query(`
    SELECT w.id, w.non_functional_days, w.requested_by, w.requested_at,
      r.id AS rider_id, r.name AS rider_name, r.rider_code, v.ev_number
    FROM ${schemas.ops}.rent_waiver_requests w
    JOIN ${schemas.ops}.riders r ON r.id = w.rider_id
    JOIN ${schemas.ops}.rider_vehicle_assignments a ON a.id = w.assignment_id
    JOIN ${schemas.ops}.vehicles v ON v.id = a.vehicle_id
    WHERE w.status = 'pending'
    ORDER BY w.requested_at ASC
  `);
  return NextResponse.json(res.rows);
}
