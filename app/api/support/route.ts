import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

// Investor support request: one email to the admin, one (confirmation) to the investor.
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== "investor") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { subject, message } = await req.json();
  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!process.env.MAIL_FROM || !adminEmail) {
    return NextResponse.json({ error: "Email is not configured on the server" }, { status: 500 });
  }

  const cleanSubject = String(subject).trim();
  const cleanMessage = String(message).trim();
  const when = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  // Admin copy is the critical one.
  try {
    await sendEmail({
      to: adminEmail,
      subject: `Support request: ${cleanSubject}`,
      text:
        `Support request from investor ${session.name} (${session.email}).\n\n` +
        `Subject: ${cleanSubject}\n\n` +
        `Message:\n${cleanMessage}\n\n` +
        `Received: ${when}`,
    });
  } catch (err) {
    console.error("Support admin email failed:", err);
    return NextResponse.json({ error: "Could not submit your request. Please try again." }, { status: 502 });
  }

  // Investor confirmation — best-effort.
  try {
    await sendEmail({
      to: session.email,
      subject: `We received your support request: ${cleanSubject}`,
      text:
        `Hi ${session.name},\n\n` +
        `We've received your support request and the MoveGrid team will get back to you shortly.\n\n` +
        `Subject: ${cleanSubject}\n` +
        `Message:\n${cleanMessage}`,
    });
  } catch (err) {
    console.error("Support investor confirmation failed (non-fatal):", err);
  }

  return NextResponse.json({ success: true });
}
