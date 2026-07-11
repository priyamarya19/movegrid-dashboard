import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;

  const vehicleId = req.nextUrl.searchParams.get("vehicle_id");
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicle_id is required" }, { status: 400 });
  }

  const result = await pool.query(`
    SELECT vr.id, vr.part_name, vr.amount, to_char(vr.repair_date,'YYYY-MM-DD') AS repair_date,
           vr.payment_mode, vr.payment_reference, vr.notes, vr.rider_name_raw,
           vr.rider_id, r.name AS rider_name, vr.created_at
    FROM ${schemas.ops}.vehicle_repairs vr
    LEFT JOIN ${schemas.ops}.riders r ON r.id = vr.rider_id
    WHERE vr.vehicle_id = $1
    ORDER BY vr.repair_date DESC NULLS LAST, vr.created_at DESC
  `, [vehicleId]);

  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const b = await req.json();
  if (!b.vehicle_id || b.amount == null) {
    return NextResponse.json({ error: "vehicle_id and amount are required" }, { status: 400 });
  }

  const v = await pool.query(`SELECT id FROM ${schemas.ops}.vehicles WHERE id = $1`, [b.vehicle_id]);
  if (!v.rows[0]) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }

  // Best-effort current rider on this vehicle, for linking -- not authoritative,
  // ops can leave it blank if the repair predates/postdates who's on it now.
  const activeAssignment = await pool.query(
    `SELECT rider_id FROM ${schemas.ops}.rider_vehicle_assignments WHERE vehicle_id = $1 AND status = 'active'`,
    [b.vehicle_id]
  );
  const riderId = activeAssignment.rows[0]?.rider_id ?? null;

  const result = await pool.query(`
    INSERT INTO ${schemas.ops}.vehicle_repairs
      (vehicle_id, rider_id, part_name, amount, repair_date, payment_mode, payment_reference, notes, recorded_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id
  `, [
    b.vehicle_id, riderId, b.part_name ?? null, Number(b.amount), b.repair_date ?? null,
    b.payment_mode ?? null, b.payment_reference ?? null, b.notes ?? null, session.name,
  ]);

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
