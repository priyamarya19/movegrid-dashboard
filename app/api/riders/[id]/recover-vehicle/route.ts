import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { istTodayISO } from "@/lib/date";
import { writeAudit } from "@/lib/audit";
import { outstandingSql } from "@/lib/rent";

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
    const outstanding = Math.round(Number(a.outstanding) || 0);

    await client.query(
      `UPDATE ${S}.rider_vehicle_assignments SET
         status = 'returned', returned_date = $1, returned_by = $2,
         return_remarks = $3
       WHERE id = $4`,
      [recoveredDate, session.name, `VEHICLE RECOVERED — ${b.reason}${b.notes ? `: ${String(b.notes).trim()}` : ""}`, a.id]
    );

    await client.query(`UPDATE ${S}.vehicles SET status = 'returned' WHERE id = $1`, [a.vehicle_id]);

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
