import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

// GET /api/vehicles/[id]/history — the vehicle's life story, newest first:
// deployments/returns (from assignments, full history) interleaved with manual
// state changes + reasons (from the status log). Return/recovery/replacement
// details ride on the assignment rows' remarks, so nothing shows twice.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const S = schemas.ops;

  const res = await pool.query(`
    SELECT * FROM (
      SELECT 'deployed' AS kind, a.assigned_date::timestamptz AS at,
        NULL::text AS from_status, NULL::text AS to_status, a.allotment_code AS detail,
        a.allotted_by AS actor, r.name AS rider_name, r.id AS rider_id
      FROM ${S}.rider_vehicle_assignments a JOIN ${S}.riders r ON r.id = a.rider_id
      WHERE a.vehicle_id = $1
      UNION ALL
      SELECT CASE WHEN a.return_remarks ILIKE 'VEHICLE RECOVERED%' THEN 'recovered' ELSE 'returned' END,
        a.returned_date::timestamptz, NULL, NULL, a.return_remarks,
        a.returned_by, r.name, r.id
      FROM ${S}.rider_vehicle_assignments a JOIN ${S}.riders r ON r.id = a.rider_id
      WHERE a.vehicle_id = $1 AND a.returned_date IS NOT NULL
      UNION ALL
      SELECT 'status', l.created_at, l.from_status, l.to_status, l.reason,
        l.actor, NULL, NULL
      FROM ${S}.vehicle_status_log l
      WHERE l.vehicle_id = $1 AND l.source = 'manual'
    ) ev
    ORDER BY ev.at DESC NULLS LAST
    LIMIT 200`, [id]);

  return NextResponse.json({ events: res.rows });
}
