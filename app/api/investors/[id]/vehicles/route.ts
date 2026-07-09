import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

// Bulk-map vehicles to this investor. Only vehicles not already linked to any
// investor are mapped (already-linked vehicles are silently skipped).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const body = await req.json();
  const vehicleIds: string[] = Array.isArray(body.vehicle_ids) ? body.vehicle_ids : [];

  if (vehicleIds.length === 0) {
    return NextResponse.json({ error: "No vehicles selected" }, { status: 400 });
  }

  const inv = await pool.query(
    `SELECT id FROM ${schemas.ops}.investor_profiles WHERE id = $1`,
    [id]
  );
  if (!inv.rows[0]) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  const result = await pool.query(
    `UPDATE ${schemas.ops}.vehicles
       SET investor_id = $1
     WHERE id = ANY($2::uuid[]) AND investor_id IS NULL
     RETURNING id`,
    [id, vehicleIds]
  );

  return NextResponse.json({ success: true, mapped: result.rowCount });
}
