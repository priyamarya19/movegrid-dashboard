import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, requireSession, forbiddenResponse } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;

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

// Ops-settable statuses (the system sets 'assigned' / 'returned' automatically).
const OPS_STATUSES = ["under_maintenance", "mechanically_ok", "ready_to_deploy"];

// PATCH handles: (a) vehicle status change (admin/ops), (b) investor mapping (admin only).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const { id } = await params;
  const body = await req.json();

  // --- Status change ---
  if (body.status !== undefined) {
    if (!["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
      return forbiddenResponse();
    }
    if (!OPS_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const cur = await pool.query(`SELECT status FROM ${schemas.ops}.vehicles WHERE id = $1`, [id]);
    if (!cur.rows[0]) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    if (cur.rows[0].status === "assigned") {
      return NextResponse.json({ error: "Can't change status while the vehicle is assigned to a rider. Process the return first." }, { status: 409 });
    }
    await pool.query(`UPDATE ${schemas.ops}.vehicles SET status = $1 WHERE id = $2`, [body.status, id]);
    return NextResponse.json({ success: true, status: body.status });
  }

  // --- Investor mapping (admin only) ---
  if (session.role !== "admin") {
    return forbiddenResponse();
  }
  const investorId = body.investor_id || null;

  if (investorId) {
    const inv = await pool.query(
      `SELECT id FROM ${schemas.ops}.investor_profiles WHERE id = $1`,
      [investorId]
    );
    if (!inv.rows[0]) {
      return NextResponse.json({ error: "Invalid investor" }, { status: 400 });
    }
  }

  const result = await pool.query(
    `UPDATE ${schemas.ops}.vehicles SET investor_id = $1 WHERE id = $2 RETURNING id`,
    [investorId, id]
  );
  if (!result.rows[0]) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, investor_id: investorId });
}
