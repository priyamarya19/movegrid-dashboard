import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  const [vehicle, assignments, payouts] = await Promise.all([
    pool.query(`
      SELECT v.*, m.model_name, m.oem, m.rental_per_day,
             h.hub_name, h.id AS hub_id, h.city AS hub_city,
             u.name AS investor_name, ip.id AS investor_id, ip.total_invested
      FROM ${schemas.ops}.vehicles v
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = v.hub_id
      LEFT JOIN ${schemas.ops}.investor_profiles ip ON ip.id = v.investor_id
      LEFT JOIN ${schemas.auth}.users u ON u.id = ip.user_id
      WHERE v.id = $1
    `, [id]),

    pool.query(`
      SELECT rva.assigned_date, rva.returned_date, rva.status,
             r.name AS rider_name, r.id AS rider_id, r.mobile AS rider_mobile
      FROM ${schemas.ops}.rider_vehicle_assignments rva
      JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
      WHERE rva.vehicle_id = $1
      ORDER BY rva.assigned_date DESC
    `, [id]),

    pool.query(`
      SELECT amount, due_date, paid_date, status
      FROM ${schemas.ops}.investor_payouts
      WHERE vehicle_id = $1
      ORDER BY due_date DESC
    `, [id]),
  ]);

  if (!vehicle.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    vehicle: vehicle.rows[0],
    assignments: assignments.rows,
    payouts: payouts.rows,
  });
}
