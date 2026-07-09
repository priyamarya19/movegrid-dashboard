import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;

  const { id } = await params;

  const [hub, riders, vehicles] = await Promise.all([
    pool.query(`SELECT * FROM ${schemas.ops}.hubs WHERE id = $1`, [id]),

    pool.query(`
      SELECT r.id, r.name, r.mobile, r.status, r.onboarding_fee,
             v.ev_number AS vehicle_number, v.id AS vehicle_id
      FROM ${schemas.ops}.riders r
      LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.rider_id = r.id AND rva.status = 'active'
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
      WHERE r.assigned_hub_id = $1
      ORDER BY r.status, r.name
    `, [id]),

    pool.query(`
      SELECT v.id, v.ev_number, v.status,
             m.model_name, m.oem,
             r.name AS assigned_rider, r.id AS rider_id,
             u.name AS investor_name, ip.id AS investor_id
      FROM ${schemas.ops}.vehicles v
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.vehicle_id = v.id AND rva.status = 'active'
      LEFT JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
      LEFT JOIN ${schemas.ops}.investor_profiles ip ON ip.id = v.investor_id
      LEFT JOIN ${schemas.auth}.users u ON u.id = ip.user_id
      WHERE v.hub_id = $1
      ORDER BY v.status, v.ev_number
    `, [id]),
  ]);

  if (!hub.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ hub: hub.rows[0], riders: riders.rows, vehicles: vehicles.rows });
}
