import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  const [rider, payments, assignment] = await Promise.all([
    pool.query(`
      SELECT r.*, h.hub_name, h.id AS hub_id, h.city AS hub_city
      FROM ${schemas.ops}.riders r
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = r.assigned_hub_id
      WHERE r.id = $1
    `, [id]),

    pool.query(`
      SELECT rp.amount_collected, rp.payment_date, v.ev_number
      FROM ${schemas.ops}.rider_payments rp
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = rp.vehicle_id
      WHERE rp.rider_id = $1
      ORDER BY rp.payment_date DESC
    `, [id]),

    pool.query(`
      SELECT rva.assigned_date, rva.status AS assignment_status,
             v.ev_number, v.id AS vehicle_id, v.status AS vehicle_status,
             m.model_name, m.oem
      FROM ${schemas.ops}.rider_vehicle_assignments rva
      JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      WHERE rva.rider_id = $1
      ORDER BY rva.assigned_date DESC
    `, [id]),
  ]);

  if (!rider.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalCollected = payments.rows.reduce((sum: number, p: { amount_collected: number }) => sum + Number(p.amount_collected), 0);

  return NextResponse.json({
    rider: rider.rows[0],
    payments: payments.rows,
    assignments: assignment.rows,
    totalCollected,
  });
}
