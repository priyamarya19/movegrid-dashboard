import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { istTodayISO } from "@/lib/date";
import { writeAudit } from "@/lib/audit";

// POST /api/allotments/[id]/change-rate — change the daily rate on an ACTIVE allotment
// without a full re-allotment (e.g. the rider renegotiates their km/usage deal, same
// vehicle). Modeled as a continuation so the money math (which assumes one rate per
// assignment) stays correct: the current assignment is closed the day before the new
// rate takes effect, and a linked continuation opens on the effective date with the
// new daily_rent — same rider / vehicle / allotment_code, carrying paid_through_date.
// Past weeks keep the old rate; weeks from the effective date bill the new rate.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;
  const { session } = guard;
  const { id } = await params;
  const b = await req.json();

  const newRate = Number(b.daily_rent);
  if (!(newRate > 0)) return NextResponse.json({ error: "Enter a valid daily rate", field: "daily_rent" }, { status: 400 });
  const effectiveDate = b.effective_date || istTodayISO();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the assignment for the length of the transaction. Must be active.
    const cur = (await client.query(
      `SELECT id, rider_id, vehicle_id, hub_id, daily_rent, allotment_code, status,
              to_char(paid_through_date, 'YYYY-MM-DD') AS paid_through_date,
              to_char(assigned_date, 'YYYY-MM-DD') AS assigned_date
       FROM ${schemas.ops}.rider_vehicle_assignments WHERE id = $1 FOR UPDATE`, [id]
    )).rows[0];

    if (!cur) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Allotment not found" }, { status: 404 }); }
    if (cur.status !== "active") { await client.query("ROLLBACK"); return NextResponse.json({ error: "This allotment is not active" }, { status: 409 }); }
    if (effectiveDate < cur.assigned_date) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Effective date can't be before the allotment started", field: "effective_date" }, { status: 400 }); }
    if (Number(cur.daily_rent) === newRate) { await client.query("ROLLBACK"); return NextResponse.json({ error: "That's already the current rate", field: "daily_rent" }, { status: 400 }); }

    // Close the current assignment the day before the new rate takes effect, so its
    // billing stops there. Vehicle stays 'assigned' and rider stays 'active' — the
    // continuation below keeps them holding the same vehicle. is_issue_swap is left
    // false so a later re-allotment doesn't mistake this for a hardware swap.
    await client.query(
      `UPDATE ${schemas.ops}.rider_vehicle_assignments
       SET status = 'returned', returned_date = ($1::date - 1)
       WHERE id = $2`, [effectiveDate, id]
    );

    // Open the continuation with the new rate. continues_from_assignment_id keeps the
    // rent ledger's week numbering continuous across the change (not a fresh Week 1),
    // and the shared allotment_code keeps it one tenancy on the sheet.
    const next = (await client.query(
      `INSERT INTO ${schemas.ops}.rider_vehicle_assignments
        (rider_id, vehicle_id, hub_id, assigned_date, status, daily_rent,
         paid_through_date, continues_from_assignment_id, allotment_code)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8)
       RETURNING id`,
      [cur.rider_id, cur.vehicle_id, cur.hub_id ?? null, effectiveDate, newRate,
       cur.paid_through_date, cur.id, cur.allotment_code]
    )).rows[0];

    await client.query("COMMIT");
    await writeAudit({
      action: "allotment_rate_changed", entity: "assignment", entityId: next.id,
      actorId: session.userId, actorName: session.name, req,
      details: {
        rider_id: cur.rider_id, vehicle_id: cur.vehicle_id, allotment_code: cur.allotment_code,
        from_rate: Number(cur.daily_rent), to_rate: newRate, effective_date: effectiveDate,
      },
    });
    return NextResponse.json({ id: next.id, allotment_code: cur.allotment_code, daily_rent: newRate }, { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
