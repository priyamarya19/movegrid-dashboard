import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";
import { writeAudit } from "@/lib/audit";

// PATCH /api/rider/me/kyc — the in-app KYC wizard's save. Validation mirrors the
// hub rule set: Aadhaar (number + both photos), bank details and a family
// reference are always required; PAN and DL are required ONLY when the rider
// wants a high-speed vehicle (the standing DL rule, extended to PAN).
export async function PATCH(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const riderId = guard.rider.riderId;
  const b = await req.json();

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const errors: string[] = [];

  const name = str(b.name);
  if (name.length < 3) errors.push("Full name is required");
  const currentAddress = str(b.current_address);
  if (currentAddress.length < 10) errors.push("Current address is required");
  const permanentAddress = str(b.permanent_address) || currentAddress;

  const vehiclePref = str(b.vehicle_pref);
  if (vehiclePref !== "low_speed" && vehiclePref !== "high_speed") errors.push("Choose the vehicle type you want");
  const high = vehiclePref === "high_speed";

  const aadhaar = str(b.aadhaar).replace(/\s/g, "");
  if (!/^\d{12}$/.test(aadhaar)) errors.push("Enter the 12-digit Aadhaar number");
  if (!str(b.aadhaar_front_key)) errors.push("Aadhaar front photo is required");
  if (!str(b.aadhaar_back_key)) errors.push("Aadhaar back photo is required");

  const pan = str(b.pan).toUpperCase();
  const dlNumber = str(b.dl_number).toUpperCase();
  if (high) {
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) errors.push("A valid PAN is required for a high-speed vehicle");
    if (!str(b.pan_key)) errors.push("PAN photo is required for a high-speed vehicle");
    if (dlNumber.length < 8) errors.push("Driving licence number is required for a high-speed vehicle");
    if (!str(b.dl_front_key)) errors.push("Driving licence photo is required for a high-speed vehicle");
  } else {
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) errors.push("PAN format looks wrong");
  }

  if (str(b.family_ref_name).length < 3 || str(b.family_ref_mobile).replace(/\D/g, "").length !== 10) {
    errors.push("Family reference name and 10-digit mobile are required");
  }

  const account = str(b.account_number).replace(/\s/g, "");
  const ifsc = str(b.ifsc).toUpperCase();
  if (!str(b.bank)) errors.push("Bank name is required");
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) errors.push("Enter a valid IFSC code");
  if (!/^\d{9,18}$/.test(account)) errors.push("Enter a valid account number");

  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

  await pool.query(
    `UPDATE ${schemas.ops}.riders SET
       name = $1, current_address = $2, permanent_address = $3, employer = $4,
       vehicle_pref = $5, aadhaar = $6, pan = $7, dl_number = $8,
       family_ref_name = $9, family_ref_mobile = $10,
       local_ref_name = $11, local_ref_mobile = $12,
       bank = $13, ifsc = $14, account_number = $15,
       profile_photo_url = COALESCE($16, profile_photo_url),
       aadhaar_front_url = $17, aadhaar_back_url = $18,
       pan_image_url = COALESCE($19, pan_image_url),
       dl_front_url = COALESCE($20, dl_front_url),
       dl_back_url = COALESCE($21, dl_back_url),
       kyc_submitted_at = now()
     WHERE id = $22`,
    [
      name, currentAddress, permanentAddress, str(b.employer) || null,
      vehiclePref, aadhaar, pan || null, dlNumber || null,
      str(b.family_ref_name), str(b.family_ref_mobile).replace(/\D/g, ""),
      str(b.local_ref_name) || null, str(b.local_ref_mobile).replace(/\D/g, "") || null,
      str(b.bank), ifsc, account,
      str(b.profile_photo_key) || null,
      str(b.aadhaar_front_key), str(b.aadhaar_back_key),
      str(b.pan_key) || null, str(b.dl_front_key) || null, str(b.dl_back_key) || null,
      riderId,
    ]
  );

  await writeAudit({
    action: "rider_kyc_submitted", entity: "rider", entityId: riderId,
    actorId: riderId, actorName: name, req,
    details: { vehicle_pref: vehiclePref, has_pan: !!pan, has_dl: !!dlNumber },
  });
  return NextResponse.json({ ok: true });
}
