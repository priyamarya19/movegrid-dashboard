import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";
import { writeAudit } from "@/lib/audit";
import { riderIdentityConflict, uniqueViolationMessage } from "@/lib/riderUnique";

// PATCH /api/rider/me/documents — add or replace PAN / DL after KYC (e.g. a
// low-speed rider upgrading toward a high-speed vehicle). Each document needs
// number + photo together; a replaced document resets its verified flag so the
// team re-checks it before the high-speed gate opens.
export async function PATCH(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const riderId = guard.rider.riderId;
  const b = await req.json();
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const pan = str(b.pan).toUpperCase();
  const panKey = str(b.pan_key);
  const dlNumber = str(b.dl_number).toUpperCase();
  const dlFrontKey = str(b.dl_front_key);
  const dlBackKey = str(b.dl_back_key);

  const wantsPan = !!(pan || panKey);
  const wantsDl = !!(dlNumber || dlFrontKey || dlBackKey);
  if (!wantsPan && !wantsDl) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  if (wantsPan && (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) || !panKey)) {
    return NextResponse.json({ error: "PAN needs a valid number AND a photo together" }, { status: 400 });
  }
  if (wantsDl && (dlNumber.length < 8 || !dlFrontKey)) {
    return NextResponse.json({ error: "DL needs the licence number AND a front photo together" }, { status: 400 });
  }

  // A PAN can only ever belong to one rider (mirrors the KYC-time check).
  if (wantsPan) {
    const conflict = await riderIdentityConflict({ excludeRiderId: riderId, pan });
    if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });
  }

  const sets: string[] = [];
  const vals: (string | null)[] = [];
  const push = (sql: string, v: string | null) => { vals.push(v); sets.push(sql.replace("?", `$${vals.length}`)); };

  if (wantsPan) {
    push("pan = ?", pan);
    push("pan_image_url = ?", panKey);
    sets.push("pan_verified = false", "pan_verified_by = NULL", "pan_verified_at = NULL");
  }
  if (wantsDl) {
    push("dl_number = ?", dlNumber);
    push("dl_front_url = ?", dlFrontKey);
    if (dlBackKey) push("dl_back_url = ?", dlBackKey);
    sets.push("dl_verified = false", "dl_verified_by = NULL", "dl_verified_at = NULL");
  }

  vals.push(riderId);
  try {
    await pool.query(`UPDATE ${schemas.ops}.riders SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  } catch (e) {
    const msg = uniqueViolationMessage(e);
    if (msg) return NextResponse.json({ error: msg }, { status: 409 });
    throw e;
  }

  await writeAudit({
    action: "rider_documents_updated", entity: "rider", entityId: riderId,
    actorId: riderId, actorName: guard.rider.name, req,
    details: { pan_updated: wantsPan, dl_updated: wantsDl },
  });
  return NextResponse.json({ ok: true });
}
