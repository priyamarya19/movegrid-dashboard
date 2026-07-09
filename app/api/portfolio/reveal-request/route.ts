import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

// An investor requests to know a rider's full contact number. We do NOT reveal the
// number to the investor here — both the admin and the investor get an email recording
// the request (with reason); the admin shares the number manually.
export async function POST(req: NextRequest) {
  const guard = await requireRole(req, ["investor"]);
  if ("response" in guard) return guard.response;
  const { session } = guard;

  const { vehicle_id, reason } = await req.json();
  if (!vehicle_id || !reason?.trim()) {
    return NextResponse.json({ error: "Vehicle and reason are required" }, { status: 400 });
  }

  // Resolve the rider on this vehicle, scoped to the logged-in investor's own vehicles.
  const result = await pool.query(
    `SELECT v.ev_number, rd.name AS rider_name, rd.mobile AS rider_mobile
     FROM ${schemas.ops}.vehicles v
     JOIN ${schemas.ops}.investor_profiles ip ON ip.id = v.investor_id
     LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.vehicle_id = v.id AND rva.status = 'active'
     LEFT JOIN ${schemas.ops}.riders rd ON rd.id = rva.rider_id
     WHERE v.id = $1 AND ip.user_id = $2`,
    [vehicle_id, session.userId]
  );
  const row = result.rows[0];
  if (!row) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }
  if (!row.rider_mobile) {
    return NextResponse.json({ error: "No rider is currently assigned to this vehicle" }, { status: 400 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!process.env.MAIL_FROM || !adminEmail) {
    return NextResponse.json({ error: "Email is not configured on the server" }, { status: 500 });
  }

  const when = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const cleanReason = String(reason).trim();

  // Admin notification is the critical email (admin shares the number) — must succeed.
  try {
    await sendEmail({
      to: adminEmail,
      subject: `Contact reveal request from ${session.name}`,
      text:
        `Investor ${session.name} (${session.email}) has requested a rider's full contact number.\n\n` +
        `Rider: ${row.rider_name ?? "—"}\n` +
        `Rider mobile: ${row.rider_mobile}\n` +
        `Vehicle: ${row.ev_number}\n` +
        `Reason: ${cleanReason}\n` +
        `Requested at: ${when}\n\n` +
        `Share the number with the investor only if appropriate.`,
    });
  } catch (err) {
    console.error("Reveal-request admin email failed:", err);
    return NextResponse.json({ error: "Could not send the request. Please try again." }, { status: 502 });
  }

  // Investor confirmation — best-effort (e.g. fails for unverified recipients while SES is in sandbox).
  try {
    await sendEmail({
      to: session.email,
      subject: `Your contact request has been submitted`,
      text:
        `Hi ${session.name},\n\n` +
        `Your request to view the contact number for rider ${row.rider_name ?? ""} (vehicle ${row.ev_number}) ` +
        `has been submitted to the MoveGrid team. We'll get back to you shortly.\n\n` +
        `Reason provided: ${cleanReason}`,
    });
  } catch (err) {
    console.error("Reveal-request investor confirmation failed (non-fatal):", err);
  }

  return NextResponse.json({ success: true });
}
