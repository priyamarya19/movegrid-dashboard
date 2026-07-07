import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireSession } from "@/lib/auth";

// GET /api/vehicles/[id]/assignment — returns active assignment for return form
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const { id } = await params;

  const result = await pool.query(`
    SELECT rva.id, rva.assigned_date, rva.status,
           r.name AS rider_name, r.id AS rider_id,
           v.ev_number
    FROM ${schemas.ops}.rider_vehicle_assignments rva
    JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
    JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
    WHERE rva.vehicle_id = $1 AND rva.status = 'active'
    ORDER BY rva.assigned_date DESC
    LIMIT 1
  `, [id]);

  if (!result.rows[0]) return NextResponse.json({ error: "No active assignment" }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}
