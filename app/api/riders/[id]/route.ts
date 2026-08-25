import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import { riderIdentityConflict } from "@/lib/riderUnique";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;

  const { id } = await params;

  const [rider, payments, assignment] = await Promise.all([
    pool.query(`
      SELECT r.*, h.hub_name, h.id AS hub_id, h.city AS hub_city
      FROM ${schemas.ops}.riders r
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = r.assigned_hub_id
      WHERE r.id = $1
    `, [id]),

    pool.query(`
      SELECT rp.amount_collected, rp.payment_date, v.ev_number
      FROM ${schemas.ops}.rider_payments rp
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = rp.vehicle_id
      WHERE rp.rider_id = $1
      ORDER BY rp.payment_date DESC
    `, [id]),

    pool.query(`
      SELECT rva.assigned_date, rva.status AS assignment_status, rva.allotment_code,
             v.ev_number, v.id AS vehicle_id, v.status AS vehicle_status,
             m.model_name, m.oem
      FROM ${schemas.ops}.rider_vehicle_assignments rva
      JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      WHERE rva.rider_id = $1
      ORDER BY rva.assigned_date DESC
    `, [id]),
  ]);

  if (!rider.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalCollected = payments.rows.reduce((sum: number, p: { amount_collected: number }) => sum + Number(p.amount_collected), 0);

  return NextResponse.json({
    rider: rider.rows[0],
    payments: payments.rows,
    assignments: assignment.rows,
    totalCollected,
  });
}

// PATCH — fill in or correct a rider's details after the fact.
//
// Riders do not all arrive through the onboarding form. One created from a lead
// (created_by = 'lead-backfill') or by signing up in the app has a name, a
// mobile and little else — no address, bank, references, rental mode or hub —
// and until now there was no way to complete the record. This backs the Edit
// button on the rider page, which opens the same onboarding form prefilled.
//
// Only the fields sent are touched, so a partial save cannot blank the rest.
// Same rule the create route applies (riders_rental_mode_check in the DB).
function normalizeRentalMode(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const v = String(raw).trim().toLowerCase();
  return v === "weekly" || v === "monthly" ? v : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const existing = await pool.query(
    `SELECT id, mobile FROM ${schemas.ops}.riders WHERE id = $1`, [id]
  );
  if (!existing.rows[0]) return NextResponse.json({ error: "Rider not found" }, { status: 404 });

  if (b.rental_mode != null && b.rental_mode !== "") {
    const mode = normalizeRentalMode(b.rental_mode);
    if (mode === null) {
      return NextResponse.json({ error: "rental_mode must be one of: weekly, monthly", field: "rental_mode" }, { status: 400 });
    }
    b.rental_mode = mode;
  }

  // The same identity rules as creation — excluding this rider, so re-saving
  // their own Aadhaar isn't reported as a clash with themselves.
  const conflict = await riderIdentityConflict({
    excludeRiderId: id,
    mobile: b.mobile || undefined,
    aadhaar: b.aadhaar || undefined,
    pan: b.pan || undefined,
    accountNumber: b.account_number || undefined,
  });
  if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });

  // Whitelist: anything not named here cannot be written through this route —
  // status, rider_code, balance, blacklist and the verification flags all have
  // their own deliberate paths.
  const EDITABLE = [
    "name", "nickname", "mobile", "current_address", "permanent_address", "address_map_link",
    "aadhaar", "aadhaar_front_url", "aadhaar_back_url",
    "pan", "pan_image_url",
    "dl_number", "dl_front_url", "dl_back_url", "bank_doc_url",
    "bank", "ifsc", "account_number",
    "family_ref_name", "family_ref_mobile", "family_ref_aadhaar", "family_ref_aadhaar_url",
    "local_ref_name", "local_ref_mobile",
    "rental_mode", "business_type", "b2b_company", "b2b_location", "employer",
    "onboarding_fee", "security_deposit", "assigned_hub_id",
    "profile_photo_url", "additional_photos",
  ] as const;

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const col of EDITABLE) {
    if (!(col in b)) continue;
    let v = b[col];
    if (v === "") v = null;                                  // cleared field → NULL
    if (col === "onboarding_fee" || col === "security_deposit") v = v == null ? null : Number(v);
    if (col === "additional_photos" && Array.isArray(v)) v = v.filter(Boolean).length ? v.filter(Boolean) : null;
    values.push(v);
    sets.push(`${col} = $${values.length}`);
  }
  if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  values.push(id);
  const res = await pool.query(
    `UPDATE ${schemas.ops}.riders SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING id, name`,
    values
  );

  await writeAudit({
    action: "rider_updated",
    entity: "rider",
    entityId: id,
    actorId: session.userId,
    actorName: session.name,
    req,
    details: { fields: sets.length },
  });

  return NextResponse.json({ ok: true, id: res.rows[0].id });
}
