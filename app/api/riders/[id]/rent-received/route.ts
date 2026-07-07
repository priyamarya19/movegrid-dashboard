import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, requireSession } from "@/lib/auth";

// Mark rent as received for the current period
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;
  const { id } = await params;
  const { amount, period_start, period_end, payment_screenshot_url, payment_mode, payment_utr, vehicle_id: bodyVehicleId } = await req.json();

  // Proof is mandatory (screenshot for online, photo of cash for cash).
  if (!payment_mode || !payment_screenshot_url) {
    return NextResponse.json({ error: "Payment mode and a proof image are required" }, { status: 400 });
  }

  // Vehicle for the payment: the caller may pass the week's vehicle_id (for a past
  // period); otherwise fall back to the rider's currently active assignment.
  let vehicle_id: string | null = bodyVehicleId ?? null;
  if (!vehicle_id) {
    const asgn = await pool.query(
      `SELECT vehicle_id FROM ${schemas.ops}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active' LIMIT 1`,
      [id]
    );
    vehicle_id = asgn.rows[0]?.vehicle_id ?? null;
  }

  await pool.query(
    `INSERT INTO ${schemas.ops}.rider_payments
      (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end, payment_screenshot_url, payment_mode, payment_utr, recorded_by_employee_id)
     VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8,
       (SELECT id FROM ${schemas.auth}.users WHERE name = $9 LIMIT 1))`,
    [id, vehicle_id, amount ?? 0, period_start, period_end, payment_screenshot_url, payment_mode, payment_utr ?? null, session.name]
  );

  return NextResponse.json({ ok: true });
}

// Check if rent is received for current period
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split("T")[0];

  const res = await pool.query(
    `SELECT id FROM ${schemas.ops}.rider_payments
     WHERE rider_id = $1 AND rental_period_start >= $2 AND rental_period_end <= $3
     LIMIT 1`,
    [id, monthStart, monthEnd]
  );
  return NextResponse.json({ received: res.rows.length > 0 });
}
