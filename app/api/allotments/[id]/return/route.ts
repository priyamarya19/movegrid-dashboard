import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { PAYMENT_MODES, outstandingSql } from "@/lib/rent";
import { recordRentPayment } from "@/lib/recordRentPayment";
import { istTodayISO } from "@/lib/date";
import { writeAudit } from "@/lib/audit";
import { logVehicleStatus } from "@/lib/vehicleStatusLog";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const { id } = await params;
  const b = await req.json();

  // When rent is marked cleared, a valid settlement mode + proof are mandatory.
  if (b.rent_cleared === true) {
    if (!PAYMENT_MODES.includes(b.rent_settlement_mode)) {
      return NextResponse.json({ error: "Rent settlement mode must be one of: Cash, Online, Cash + Online when rent is cleared" }, { status: 400 });
    }
    if (!b.rent_settlement_proof_url) {
      return NextResponse.json({ error: "Rent settlement proof is required when rent is cleared" }, { status: 400 });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get the assignment to find vehicle_id and rider_id. FOR UPDATE + the status
    // check make this idempotent: a retried return (e.g. the mobile outbox
    // replaying a network-dropped submit) of an already-returned assignment is a
    // no-op success, so it can't insert a duplicate penalty or re-run the state
    // changes.
    const asgn = await client.query(
      `SELECT vehicle_id, rider_id, status FROM ${schemas.ops}.rider_vehicle_assignments WHERE id = $1 FOR UPDATE`, [id]
    );
    if (!asgn.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    if (asgn.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: true, already_returned: true });
    }
    const { vehicle_id, rider_id } = asgn.rows[0];

    // "Amount collected now" at handback (₹0 allowed): recorded through the
    // normal rent ledger while the assignment is still active; whatever remains
    // outstanding afterwards becomes a bad-debt entry.
    const collectedNow = b.amount_collected != null && b.amount_collected !== "" ? Number(b.amount_collected) : 0;
    if (Number.isNaN(collectedNow) || collectedNow < 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "amount_collected must be 0 or more" }, { status: 400 });
    }
    if (collectedNow > 0 && (!PAYMENT_MODES.includes(b.rent_settlement_mode) || !b.rent_settlement_proof_url)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Settlement mode and proof are required when collecting money at return" }, { status: 400 });
    }
    if (collectedNow > 0) {
      await recordRentPayment(client, {
        riderId: rider_id, amount: collectedNow, paymentMode: b.rent_settlement_mode,
        paymentUtr: b.rent_settlement_utr ?? null, screenshotUrl: b.rent_settlement_proof_url,
      });
    }
    const freshOut = await client.query(
      `SELECT ${outstandingSql("a")} AS outstanding FROM ${schemas.ops}.rider_vehicle_assignments a WHERE a.id = $1`,
      [id]
    );
    const remainingOutstanding = Math.round(Number(freshOut.rows[0]?.outstanding) || 0);

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
        returned_by = $7,
        rent_settlement_mode = $8,
        rent_settlement_utr = $9,
        rent_settlement_proof_url = $10,
        is_issue_swap = $11,
        non_functional_days = $12
      WHERE id = $13`,
      [
        b.returned_date || istTodayISO(),
        b.rent_cleared ?? null, b.penalty_amount ?? null,
        b.condition_on_return ?? null, b.return_photos ?? null,
        b.return_remarks ?? null, session.name,
        b.rent_settlement_mode ?? null, b.rent_settlement_utr ?? null, b.rent_settlement_proof_url ?? null,
        b.is_issue_swap === true, b.non_functional_days ? Number(b.non_functional_days) : 0,
        id,
      ]
    );

    // Record a penalty (if any) against the rider, frozen to the submitted vehicle + assignment.
    const hasPenaltyAmt = b.penalty_amount != null && b.penalty_amount !== "";
    if (b.penalty_detail || hasPenaltyAmt) {
      await client.query(
        `INSERT INTO ${schemas.ops}.rider_penalties (rider_id, vehicle_id, assignment_id, amount, detail, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [rider_id, vehicle_id, id, hasPenaltyAmt ? Number(b.penalty_amount) : null, b.penalty_detail || null, session.name]
      );
    }

    // Update vehicle → returned (awaiting ops inspection; not allottable until ready_to_deploy)
    await client.query(
      `UPDATE ${schemas.ops}.vehicles SET status = 'returned' WHERE id = $1`, [vehicle_id]
    );
    await logVehicleStatus(client, {
      vehicleId: vehicle_id, from: "assigned", to: "returned",
      reason: [Array.isArray(b.condition_on_return) && b.condition_on_return.length ? `Condition: ${b.condition_on_return.join(", ")}` : null, b.return_remarks || null]
        .filter(Boolean).join(" — ") || null,
      source: "return", actor: session.name,
    });

    // Update rider → inactive
    await client.query(
      `UPDATE ${schemas.ops}.riders SET status = 'inactive' WHERE id = $1`, [rider_id]
    );

    // Rent left unpaid at handback → bad-debt register (Finance → Bad Debt).
    if (remainingOutstanding > 0) {
      await client.query(
        `INSERT INTO ${schemas.ops}.bad_debts (rider_id, vehicle_id, assignment_id, source, original_outstanding, collected_at_close, created_by)
         VALUES ($1, $2, $3, 'return', $4, $5, $6)`,
        [rider_id, vehicle_id, id, remainingOutstanding, collectedNow, session.name]
      );
    }

    await client.query("COMMIT");
    await writeAudit({
      action: "vehicle_returned", entity: "assignment", entityId: id,
      actorId: session.userId, actorName: session.name, req,
      details: { rider_id, vehicle_id, is_issue_swap: b.is_issue_swap === true, penalty_amount: b.penalty_amount ?? null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
