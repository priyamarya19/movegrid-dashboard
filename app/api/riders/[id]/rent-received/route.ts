import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

// Mark rent as received for the current period
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const { amount, period_start, period_end } = await req.json();

  // Get active vehicle for this rider
  const asgn = await pool.query(
    `SELECT vehicle_id FROM ${schemas.ops}.rider_vehicle_assignments WHERE rider_id = $1 AND status = 'active' LIMIT 1`,
    [id]
  );
  const vehicle_id = asgn.rows[0]?.vehicle_id ?? null;

  await pool.query(
    `INSERT INTO ${schemas.ops}.rider_payments
      (rider_id, vehicle_id, amount_collected, payment_date, rental_period_start, rental_period_end, recorded_by_employee_id)
     VALUES ($1, $2, $3, CURRENT_DATE, $4, $5,
       (SELECT id FROM ${schemas.auth}.users WHERE name = $6 LIMIT 1))`,
    [id, vehicle_id, amount ?? 0, period_start, period_end, session.name]
  );

  return NextResponse.json({ ok: true });
}

// Check if rent is received for current period
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
