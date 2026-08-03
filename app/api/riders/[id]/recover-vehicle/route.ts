import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { istTodayISO } from "@/lib/date";
import { writeAudit } from "@/lib/audit";
import { outstandingSql, PAYMENT_MODES } from "@/lib/rent";
import { recordRentPayment } from "@/lib/recordRentPayment";
import { logVehicleStatus } from "@/lib/vehicleStatusLog";

const REASONS = ["non_payment", "absconded", "unreachable", "other"] as const;

// POST /api/riders/[id]/recover-vehicle — record a physical vehicle recovery
// from a defaulting rider, in ONE transaction:
//   - freezes the rider's outstanding at this moment (the bad-debt figure)
//   - closes the active assignment, marked as a recovery (not a normal return)
//   - vehicle → 'returned' (re-enters the fleet via the inspection pipeline)
//   - rider → inactive, optionally blacklisted (kills their app session too)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;
  const { id: riderId } = await params;
  const b = await req.json();

  if (!REASONS.includes(b.reason)) {
    return NextResponse.json({ error: "reason must be non_payment, absconded, unreachable or other" }, { status: 400 });
  }
  if (b.reason === "other" && !(b.notes && String(b.notes).trim())) {
    return NextResponse.json({ error: "Notes are required when the reason is 'other'" }, { status: 400 });
  }
  const blacklist = b.blacklist !== false; // default ON — untick deliberately
  const recoveredDate = b.recovered_date || istTodayISO();
  const S = schemas.ops;

  // "Amount collected now" (₹0 allowed): goes through the normal rent ledger;
  // only the REMAINDER becomes bad debt. A non-zero amount needs mode + proof,
  // same discipline as every payment.
  const collectedNow = b.amount_collected != null && b.amount_collected !== "" ? Number(b.amount_collected) : 0;
  if (Number.isNaN(collectedNow) || collectedNow < 0) {
    return NextResponse.json({ error: "amount_collected must be 0 or more" }, { status: 400 });
  }
  if (collectedNow > 0 && (!PAYMENT_MODES.includes(b.payment_mode) || !b.payment_proof_url)) {
    return NextResponse.json({ error: "Payment mode and proof are required when collecting money at recovery" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const asgn = await client.query(
      `SELECT a.id, a.vehicle_id, ${outstandingSql("a")} AS outstanding
       FROM ${S}.rider_vehicle_assignments a
       WHERE a.rider_id = $1 AND a.status = 'active' LIMIT 1 FOR UPDATE`,
      [riderId]
    );
    const a = asgn.rows[0];
    if (!a) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Rider has no active vehicle assignment" }, { status: 409 });
    }

    // Collect first (assignment must still be active for the ledger), THEN
    // freeze whatever remains as the recovery dues / bad debt.
    if (collectedNow > 0) {
      await recordRentPayment(client, {
        riderId, amount: collectedNow, paymentMode: b.payment_mode,
        paymentUtr: b.payment_utr ?? null, screenshotUrl: b.payment_proof_url,
      });
    }
    const fresh = await client.query(
      `SELECT ${outstandingSql("a")} AS outstanding FROM ${S}.rider_vehicle_assignments a WHERE a.id = $1`,
      [a.id]
    );
    const outstanding = Math.round(Number(fresh.rows[0]?.outstanding) || 0);

    await client.query(
      `UPDATE ${S}.rider_vehicle_assignments SET
         status = 'returned', returned_date = $1, returned_by = $2,
         return_remarks = $3
       WHERE id = $4`,
      [recoveredDate, session.name, `VEHICLE RECOVERED — ${b.reason}${b.notes ? `: ${String(b.notes).trim()}` : ""}`, a.id]
    );

    await client.query(`UPDATE ${S}.vehicles SET status = 'returned' WHERE id = $1`, [a.vehicle_id]);
    await logVehicleStatus(client, {
      vehicleId: a.vehicle_id, from: "assigned", to: "returned",
      reason: `RECOVERED — ${b.reason}${b.notes ? `: ${String(b.notes).trim()}` : ""}`,
      source: "recovery", actor: session.name,
    });

    // Rider goes inactive; blacklisting also bumps token_version so any live
    // rider-app session dies immediately.
    if (blacklist) {
      await client.query(
        `UPDATE ${S}.riders SET status = 'inactive', is_blacklisted = true,
           blacklist_reason = $1, blacklisted_by = $2, blacklisted_at = now(),
           token_version = COALESCE(token_version, 0) + 1
         WHERE id = $3`,
        [`Vehicle recovered (${b.reason})${b.notes ? `: ${String(b.notes).trim()}` : ""}`, session.name, riderId]
      );
    } else {
      await client.query(`UPDATE ${S}.riders SET status = 'inactive' WHERE id = $1`, [riderId]);
    }

    const rec = await client.query(
      `INSERT INTO ${S}.vehicle_recoveries
        (rider_id, vehicle_id, assignment_id, recovered_date, reason, location, notes, photos, outstanding_at_recovery, blacklisted, recovered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        riderId, a.vehicle_id, a.id, recoveredDate, b.reason,
        b.location ? String(b.location).trim() : null,
        b.notes ? String(b.notes).trim() : null,
        Array.isArray(b.photos) && b.photos.length ? b.photos : null,
        outstanding, blacklist, session.name,
      ]
    );

    // The remainder is the bad debt (Finance → Bad Debt tab).
    if (outstanding > 0) {
      await client.query(
        `INSERT INTO ${S}.bad_debts (rider_id, vehicle_id, assignment_id, source, original_outstanding, collected_at_close, created_by)
         VALUES ($1, $2, $3, 'recovery', $4, $5, $6)`,
        [riderId, a.vehicle_id, a.id, outstanding, collectedNow, session.name]
      );
    }

    await client.query("COMMIT");
    await writeAudit({
      action: "vehicle_recovered", entity: "rider", entityId: riderId,
      actorId: session.userId, actorName: session.name, req,
      details: { recovery_id: rec.rows[0].id, vehicle_id: a.vehicle_id, reason: b.reason, outstanding, blacklisted: blacklist },
    });
    return NextResponse.json({ ok: true, recovery_id: rec.rows[0].id, outstanding_at_recovery: outstanding });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
