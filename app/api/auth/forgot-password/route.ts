import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { sendEmail } from "@/lib/email";
import { JWT_SECRET as secret } from "@/lib/jwt";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const normalized = String(email).toLowerCase().trim();

  // This route is public (see PUBLIC_PATHS in proxy.ts). Throttle two ways: per-IP
  // to stop one host spraying reset links across many accounts, and per-email to
  // stop mailbombing a single inbox.
  const ip = clientIp(req);
  const ipRl = rateLimit(`forgot-ip:${ip}`, { max: 15 });
  const emailRl = rateLimit(`forgot-email:${normalized}`, { max: 5 });
  if (!ipRl.ok || !emailRl.ok) {
    const retryAfterSec = Math.max(ipRl.retryAfterSec, emailRl.retryAfterSec);
    return NextResponse.json(
      { error: "Too many requests. Please try again later.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  const result = await pool.query(
    `SELECT id, name FROM ${schemas.auth}.users WHERE email = $1 AND status = 'active'`,
    [normalized]
  );

  // Always respond identically whether or not the email exists — never reveal
  // account existence, and never return the token/URL to the caller.
  if (result.rows[0]) {
    const user = result.rows[0];

    const token = await new SignJWT({ userId: user.id, purpose: "password_reset" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    try {
      await sendEmail({
        to: normalized,
        subject: "Reset your MoveGrid password",
        text:
          `Hi ${user.name},\n\n` +
          `We received a request to reset your MoveGrid password. ` +
          `Open the link below to choose a new one. It expires in 1 hour.\n\n` +
          `${resetUrl}\n\n` +
          `If you didn't request this, you can safely ignore this email — your password won't change.\n\n` +
          `— MoveGrid`,
        html: `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
      <h2 style="margin:0 0 4px;">Reset your password</h2>
      <p style="color:#555;margin:0 0 16px;">Hi ${user.name}, we received a request to reset your MoveGrid password.</p>
      <p style="margin:0 0 20px;">
        <a href="${resetUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px;">Set a new password</a>
      </p>
      <p style="color:#888;font-size:12px;margin:0 0 8px;">This link expires in 1 hour. If the button doesn't work, paste this URL into your browser:</p>
      <p style="color:#16a34a;font-size:12px;word-break:break-all;margin:0 0 20px;">${resetUrl}</p>
      <p style="color:#999;font-size:12px;margin:0;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>`,
      });
    } catch (err) {
      // Log server-side but don't surface delivery status to the caller.
      console.error("[forgot-password] failed to send reset email:", err);
    }
  }

  return NextResponse.json({ sent: true });
}
