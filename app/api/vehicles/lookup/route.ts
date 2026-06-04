import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

// GET /api/vehicles/lookup?ev_number=MG001 — returns vehicle details for allotment form auto-fill
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ev = req.nextUrl.searchParams.get("ev_number");
  const mobile = req.nextUrl.searchParams.get("mobile"); // rider lookup

  if (ev) {
    const result = await pool.query(`
      SELECT v.id, v.ev_number, v.chassis_number, v.motor_number, v.controller_number,
             v.battery_number, v.status, m.oem, m.model_name, h.id AS hub_id, h.hub_name
      FROM ${schemas.ops}.vehicles v
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = v.hub_id
      WHERE LOWER(v.ev_number) = LOWER($1)
    `, [ev]);
    if (!result.rows[0]) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  }

  if (mobile) {
    const result = await pool.query(`
      SELECT r.id, r.name, r.nickname, r.mobile, r.status, r.rental_mode,
             r.onboarding_fee, r.security_deposit, h.id AS hub_id, h.hub_name
      FROM ${schemas.ops}.riders r
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = r.assigned_hub_id
      WHERE r.mobile = $1
    `, [mobile]);
    if (!result.rows[0]) return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  }

  return NextResponse.json({ error: "Provide ev_number or mobile" }, { status: 400 });
}
