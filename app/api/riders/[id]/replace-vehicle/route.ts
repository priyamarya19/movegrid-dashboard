import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { istTodayISO } from "@/lib/date";
import { writeAudit } from "@/lib/audit";
import { highSpeedDocsMissing } from "@/lib/highSpeedGate";
import { logVehicleStatus } from "@/lib/vehicleStatusLog";

// Old-vehicle destinations a replacement is allowed to set. 'returned' means
// "awaiting inspection" — the same state a normal return leaves a vehicle in.
const OLD_VEHICLE_STATUSES = ["under_maintenance", "returned", "ready_to_deploy"] as const;

// POST /api/riders/[id]/replace-vehicle — swap the physical vehicle on a rider's
// active tenancy in ONE atomic action, replacing the error-prone two-step
// return + re-allot dance. The tenancy itself is untouched: same allotment code,
// paid_through_date and ₹ credit carry over, rent cycle numbering continues
// (continues_from_assignment_id), no onboarding fee, no week-1 advance. Money is
// deliberately NOT handled here — payments go through the normal rent-received
// flow so they always land in the ledger (the old path lost cash taken at
// re-allotment, e.g. Md Barik's ₹3,000).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;
  const { id: riderId } = await params;
  const b = await req.json();

  if (!b.new_vehicle_id) return NextResponse.json({ error: "new_vehicle_id is required" }, { status: 400 });
  if (!b.reason || !String(b.reason).trim()) {
    return NextResponse.json({ error: "A reason for the replacement is required" }, { status: 400 });
  }
  const oldStatus = b.old_vehicle_status ?? "under_maintenance";
  if (!OLD_VEHICLE_STATUSES.includes(oldStatus)) {
    return NextResponse.json({ error: "old_vehicle_status must be under_maintenance, returned or ready_to_deploy" }, { status: 400 });
  }
  const nfd = b.non_functional_days ? Number(b.non_functional_days) : 0;
  if (Number.isNaN(nfd) || nfd < 0 || nfd > 90) {
    return NextResponse.json({ error: "non_functional_days must be between 0 and 90" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const asgn = await client.query(
      `SELECT id, vehicle_id, hub_id, daily_rent, allotment_code, rent_credit,
              to_char(paid_through_date, 'YYYY-MM-DD') AS paid_through_date
       FROM ${schemas.ops}.rider_vehicle_assignments
       WHERE rider_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE`,
      [riderId]
    );
    const old = asgn.rows[0];
    if (!old) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Rider has no active vehicle assignment" }, { status: 409 });
    }
    if (old.vehicle_id === b.new_vehicle_id) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "The replacement is the same vehicle" }, { status: 400 });
    }

    const veh = await client.query(
      `SELECT id, ev_number, status FROM ${schemas.ops}.vehicles WHERE id = $1 FOR UPDATE`,
      [b.new_vehicle_id]
    );
    if (!veh.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Replacement vehicle not found" }, { status: 404 });
    }
    if (veh.rows[0].status !== "ready_to_deploy") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: `Vehicle ${veh.rows[0].ev_number} is not ready to deploy (${veh.rows[0].status})` }, { status: 409 });
    }

    // High-speed replacements demand DL + PAN on file, same as fresh allotments.
    const docsGate = await highSpeedDocsMissing(client, b.new_vehicle_id, riderId);
    if (docsGate) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: docsGate }, { status: 409 });
    }

    const today = istTodayISO();

    // Close the old assignment as an issue-swap return (money fields untouched)
    // and move its ₹ credit onto the continuation so nothing is lost.
    await client.query(
      `UPDATE ${schemas.ops}.rider_vehicle_assignments SET
         status = 'returned', returned_date = $1, returned_by = $2,
         return_remarks = $3, return_photos = $4,
         is_issue_swap = true, non_functional_days = $5, rent_credit = 0
       WHERE id = $6`,
      [today, session.name, String(b.reason).trim(), b.photos ?? null, nfd, old.id]
    );

    const created = await client.query(
      `INSERT INTO ${schemas.ops}.rider_vehicle_assignments (
         rider_id, vehicle_id, hub_id, assigned_date, status, allotted_by,
         daily_rent, paid_through_date, rent_credit, continues_from_assignment_id, allotment_code
       ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        riderId, b.new_vehicle_id, old.hub_id, today, session.name,
        old.daily_rent, old.paid_through_date, old.rent_credit ?? 0, old.id, old.allotment_code,
      ]
    );

    await client.query(`UPDATE ${schemas.ops}.vehicles SET status = $1 WHERE id = $2`, [oldStatus, old.vehicle_id]);
    await client.query(`UPDATE ${schemas.ops}.vehicles SET status = 'assigned' WHERE id = $1`, [b.new_vehicle_id]);
    await logVehicleStatus(client, {
      vehicleId: old.vehicle_id, from: "assigned", to: oldStatus,
      reason: `Replaced out — ${String(b.reason).trim()}`, source: "replacement", actor: session.name,
    });
    await logVehicleStatus(client, {
      vehicleId: b.new_vehicle_id, from: "ready_to_deploy", to: "assigned",
      reason: `Replacement for ${veh.rows[0].ev_number ? "previous vehicle" : "swap"} (${old.allotment_code ?? "swap"})`, source: "replacement", actor: session.name,
    });

    // Downtime credit waits for approval, same as the classic issue-swap flow.
    if (nfd > 0) {
      await client.query(
        `INSERT INTO ${schemas.ops}.rent_waiver_requests (rider_id, assignment_id, non_functional_days, reason, requested_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [riderId, created.rows[0].id, nfd, `Vehicle replacement: ${String(b.reason).trim()}`, session.name]
      );
    }

    await client.query("COMMIT");
    await writeAudit({
      action: "vehicle_replaced", entity: "rider", entityId: riderId,
      actorId: session.userId, actorName: session.name, req,
      details: {
        old_vehicle_id: old.vehicle_id, new_vehicle_id: b.new_vehicle_id,
        reason: String(b.reason).trim(), non_functional_days: nfd, old_vehicle_status: oldStatus,
      },
    });
    return NextResponse.json({ ok: true, new_assignment_id: created.rows[0].id, waiver_requested: nfd > 0 });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
