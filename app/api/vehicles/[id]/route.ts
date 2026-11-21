import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, requireSession, forbiddenResponse, canEditVehicleDetails } from "@/lib/auth";
import { logVehicleStatus } from "@/lib/vehicleStatusLog";
import { writeAudit } from "@/lib/audit";

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
      SELECT rva.assigned_date, rva.returned_date, rva.status, rva.allotment_code,
             r.name AS rider_name, r.id AS rider_id, r.mobile AS rider_mobile, r.rider_code
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
    // The reason IS the record: mandatory when flagging a problem or declaring
    // it fixed; optional for Ready to Deploy.
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if ((body.status === "under_maintenance" || body.status === "mechanically_ok") && !reason) {
      return NextResponse.json(
        { error: body.status === "under_maintenance" ? "What's the issue? A reason is required for Under Maintenance." : "What was checked/fixed? A reason is required for Mechanically OK." },
        { status: 400 }
      );
    }
    const cur = await pool.query(`SELECT status FROM ${schemas.ops}.vehicles WHERE id = $1`, [id]);
    if (!cur.rows[0]) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    if (cur.rows[0].status === "assigned") {
      return NextResponse.json({ error: "Can't change status while the vehicle is assigned to a rider. Process the return first." }, { status: 409 });
    }
    await pool.query(`UPDATE ${schemas.ops}.vehicles SET status = $1 WHERE id = $2`, [body.status, id]);
    await logVehicleStatus(pool, {
      vehicleId: id, from: cur.rows[0].status, to: body.status,
      reason: reason || null, source: "manual", actor: session.name,
    });
    return NextResponse.json({ success: true, status: body.status });
  }

  // --- Vehicle details edit ---
  // Admins always; anyone else needs the "vehicle_edit" App Page granted in
  // Settings → Users. These are identity fields (chassis, motor, IMEI), so every
  // change is audited with its before/after — a silently corrected chassis
  // number is indistinguishable from a swapped vehicle otherwise.
  if (body.details && typeof body.details === "object") {
    const allowed = await canEditVehicleDetails(session);
    if (!allowed) return forbiddenResponse();

    const d = body.details as Record<string, unknown>;
    const TEXT_FIELDS = [
      "ev_number", "chassis_number", "motor_number", "controller_number",
      "iot_imei", "iot_partner", "battery_number", "battery_partner",
      "vehicle_photo_url", "rc_book_url",
    ] as const;

    const before = await pool.query(
      `SELECT v.*, m.oem FROM ${schemas.ops}.vehicles v
       LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
       WHERE v.id = $1`,
      [id]
    );
    const prev = before.rows[0];
    if (!prev) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

    const sets: string[] = [];
    const vals: unknown[] = [];
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    const push = (col: string, value: unknown) => {
      if (value === undefined) return;
      const normalised = value === "" ? null : value;
      if (String(prev[col] ?? "") === String(normalised ?? "")) return;
      sets.push(`${col} = $${sets.length + 1}`);
      vals.push(normalised);
      changed[col] = { from: prev[col] ?? null, to: normalised };
    };

    for (const f of TEXT_FIELDS) {
      if (d[f] !== undefined) push(f, typeof d[f] === "string" ? (d[f] as string).trim() : d[f]);
    }
    if (d.hub_id !== undefined) push("hub_id", d.hub_id || null);
    if (d.purchase_date !== undefined) push("purchase_date", d.purchase_date || null);
    if (d.price !== undefined) push("price", d.price === "" || d.price === null ? null : Number(d.price));
    if (Array.isArray(d.vehicle_photos)) {
      const pics = (d.vehicle_photos as string[]).filter(Boolean);
      push("vehicle_photos", pics.length ? pics : null);
    }

    // OEM arrives by name (that's what the form offers); resolve it to a model.
    if (typeof d.oem === "string" && d.oem && d.oem !== prev.oem) {
      const model = await pool.query(
        `SELECT id FROM ${schemas.ops}.vehicle_models WHERE oem = $1 LIMIT 1`,
        [d.oem]
      );
      if (!model.rows[0]) return NextResponse.json({ error: `No model row for OEM "${d.oem}"` }, { status: 400 });
      push("model_id", model.rows[0].id);
      changed.oem = { from: prev.oem ?? null, to: d.oem };
    }

    if (!sets.length) return NextResponse.json({ success: true, changed: 0 });

    // EV number identifies the bike to everyone who touches it. Assignments and
    // payments key off the vehicle id, so a rename is safe for the data — but it
    // must not collide with another bike.
    if (changed.ev_number) {
      const clash = await pool.query(
        `SELECT id FROM ${schemas.ops}.vehicles WHERE LOWER(ev_number) = LOWER($1) AND id <> $2 LIMIT 1`,
        [changed.ev_number.to, id]
      );
      if (clash.rows[0]) {
        return NextResponse.json({ error: `EV number ${changed.ev_number.to} already belongs to another vehicle` }, { status: 409 });
      }
    }

    vals.push(id);
    await pool.query(`UPDATE ${schemas.ops}.vehicles SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);

    await writeAudit({
      action: "vehicle_details_edited", entity: "vehicle", entityId: id,
      actorId: session.userId, actorName: session.name, req,
      details: { ev_number: prev.ev_number, changed },
    });

    return NextResponse.json({ success: true, changed: Object.keys(changed).length });
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
