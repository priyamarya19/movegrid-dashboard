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

  const [investor, vehicles, payouts] = await Promise.all([
    pool.query(`
      SELECT ip.*, u.name, u.email, u.mobile
      FROM ${schemas.ops}.investor_profiles ip
      JOIN ${schemas.auth}.users u ON u.id = ip.user_id
      WHERE ip.id = $1
    `, [id]),

    pool.query(`
      SELECT v.id, v.ev_number, v.status,
             m.model_name, m.oem,
             h.hub_name,
             r.name AS assigned_rider, r.id AS rider_id
      FROM ${schemas.ops}.vehicles v
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = v.hub_id
      LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.vehicle_id = v.id AND rva.status = 'active'
      LEFT JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
      WHERE v.investor_id = $1
      ORDER BY v.ev_number
    `, [id]),

    pool.query(`
      SELECT amount, due_date, paid_date, status, v.ev_number
      FROM ${schemas.ops}.investor_payouts pay
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = pay.vehicle_id
      WHERE pay.investor_id = $1
      ORDER BY pay.due_date DESC
    `, [id]),
  ]);

  if (!investor.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalPaid = payouts.rows.filter((p: { status: string }) => p.status === "paid").reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
  const totalPending = payouts.rows.filter((p: { status: string }) => p.status === "pending").reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);

  return NextResponse.json({ investor: investor.rows[0], vehicles: vehicles.rows, payouts: payouts.rows, totalPaid, totalPending });
}
