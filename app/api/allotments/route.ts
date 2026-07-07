import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const b = await req.json();
  if (!b.rider_id || !b.vehicle_id) {
    return NextResponse.json({ error: "Rider and vehicle are required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check vehicle is available
    const vCheck = await client.query(
      `SELECT id, status FROM ${schemas.ops}.vehicles WHERE id = $1`, [b.vehicle_id]
    );
    if (!vCheck.rows[0]) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    if (vCheck.rows[0].status === "assigned") {
      return NextResponse.json({ error: "Vehicle is already assigned to another rider" }, { status: 409 });
    }
    // Only vehicles cleared by ops (Ready to Deploy) can be allotted.
    if (vCheck.rows[0].status !== "ready_to_deploy") {
      return NextResponse.json({ error: "Vehicle must be 'Ready to Deploy' before it can be allotted. Set its status first." }, { status: 409 });
    }

    // Close any existing active assignment for this rider
    await client.query(
      `UPDATE ${schemas.ops}.rider_vehicle_assignments SET status = 'returned', returned_date = CURRENT_DATE
       WHERE rider_id = $1 AND status = 'active'`,
      [b.rider_id]
    );

    // Create new assignment
    const result = await client.query(`
      INSERT INTO ${schemas.ops}.rider_vehicle_assignments (
        rider_id, vehicle_id, hub_id, assigned_date, status,
        amount_collected, payment_screenshot_url, undertaking_url, allotment_pics, allotted_by
      ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9)
      RETURNING id`,
      [
        b.rider_id, b.vehicle_id, b.hub_id ?? null,
        b.assigned_date || new Date().toISOString().split("T")[0],
        b.amount_collected ?? null, b.payment_screenshot_url ?? null,
        b.undertaking_url ?? null, b.allotment_pics ?? null, session.name,
      ]
    );

    // Update rider: status → active, rental_mode, onboarding_fee, security_deposit
    await client.query(
      `UPDATE ${schemas.ops}.riders SET status = 'active', rental_mode = COALESCE($1, rental_mode),
       onboarding_fee = COALESCE($2, onboarding_fee), security_deposit = COALESCE($3, security_deposit)
       WHERE id = $4`,
      [b.rental_mode ?? null, b.onboarding_fee ?? null, b.security_deposit ?? null, b.rider_id]
    );

    // Update vehicle status → assigned
    await client.query(
      `UPDATE ${schemas.ops}.vehicles SET status = 'assigned', hub_id = COALESCE($1, hub_id) WHERE id = $2`,
      [b.hub_id ?? null, b.vehicle_id]
    );

    await client.query("COMMIT");
    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
