import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

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
    SELECT w.id, w.non_functional_days, w.reason, w.requested_by, w.requested_at,
      r.id AS rider_id, r.name AS rider_name, r.rider_code, v.ev_number
    FROM ${schemas.ops}.rent_waiver_requests w
    JOIN ${schemas.ops}.riders r ON r.id = w.rider_id
    JOIN ${schemas.ops}.rider_vehicle_assignments a ON a.id = w.assignment_id
    JOIN ${schemas.ops}.vehicles v ON v.id = a.vehicle_id
    WHERE w.status = 'pending'
    ORDER BY w.requested_at ASC
  `);
  // non_functional_days is numeric since migration 013 — pg returns it as a
  // string; both review UIs expect a number.
  return NextResponse.json(res.rows.map((r) => ({ ...r, non_functional_days: Number(r.non_functional_days) })));
}

// Manually apply for a rent waiver on a rider's active assignment. Days may be
// fractional (1.5 = a day and a half); alternatively an ₹ amount is accepted and
// converted using the assignment's daily rate. The request lands in the same
// pending → approve/reject queue as the auto-raised issue-swap credits.
export async function POST(req: NextRequest) {
  const guard = await requireRole(req); // admin, ops_manager, hub_incharge
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const { rider_id, days, amount, reason } = await req.json();
  if (!rider_id) return NextResponse.json({ error: "rider_id is required" }, { status: 400 });
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: "A reason for the waiver is required" }, { status: 400 });
  }

  const asgn = await pool.query(
    `SELECT id, daily_rent FROM ${schemas.ops}.rider_vehicle_assignments
     WHERE rider_id = $1 AND status = 'active' LIMIT 1`,
    [rider_id]
  );
  if (!asgn.rows[0]) {
    return NextResponse.json({ error: "Rider has no active vehicle assignment" }, { status: 409 });
  }
  const dailyRent = Number(asgn.rows[0].daily_rent) || 0;

  let daysNum = Number(days);
  if ((days == null || days === "") && amount != null && amount !== "") {
    const amt = Number(amount);
    if (!(amt > 0)) return NextResponse.json({ error: "Enter a valid waiver amount" }, { status: 400 });
    if (!dailyRent) {
      return NextResponse.json({ error: "No daily rate set on the assignment — enter the waiver in days instead" }, { status: 409 });
    }
    daysNum = amt / dailyRent;
  }
  daysNum = Math.round(daysNum * 100) / 100;
  if (!(daysNum > 0)) return NextResponse.json({ error: "Enter the waiver as days or an ₹ amount" }, { status: 400 });
  if (daysNum > 90) return NextResponse.json({ error: "Waiver too large — max 90 days per request" }, { status: 400 });

  await pool.query(
    `INSERT INTO ${schemas.ops}.rent_waiver_requests (rider_id, assignment_id, non_functional_days, reason, requested_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [rider_id, asgn.rows[0].id, daysNum, String(reason).trim(), session.name]
  );
  await writeAudit({
    action: "waiver_requested", entity: "rider", entityId: rider_id,
    actorId: session.userId, actorName: session.name, req,
    details: { days: daysNum, reason: String(reason).trim() },
  });
  return NextResponse.json({ ok: true, days: daysNum });
}
