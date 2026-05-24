import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const b = await req.json();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get the assignment to find vehicle_id and rider_id
    const asgn = await client.query(
      `SELECT vehicle_id, rider_id FROM ${schemas.ops}.rider_vehicle_assignments WHERE id = $1`, [id]
    );
    if (!asgn.rows[0]) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    const { vehicle_id, rider_id } = asgn.rows[0];

    // Update assignment
    await client.query(`
      UPDATE ${schemas.ops}.rider_vehicle_assignments SET
        status = 'returned',
        returned_date = $1,
        rent_cleared = $2,
        penalty_amount = $3,
        condition_on_return = $4,
        return_photos = $5,
        return_remarks = $6,
        returned_by = $7
      WHERE id = $8`,
      [
        b.returned_date || new Date().toISOString().split("T")[0],
        b.rent_cleared ?? null, b.penalty_amount ?? null,
        b.condition_on_return ?? null, b.return_photos ?? null,
        b.return_remarks ?? null, session.name, id,
      ]
    );

    // Update vehicle → available
    await client.query(
      `UPDATE ${schemas.ops}.vehicles SET status = 'available' WHERE id = $1`, [vehicle_id]
    );

    // Update rider → inactive
    await client.query(
      `UPDATE ${schemas.ops}.riders SET status = 'inactive' WHERE id = $1`, [rider_id]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
