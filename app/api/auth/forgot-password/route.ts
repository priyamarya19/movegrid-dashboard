import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback_secret");

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const result = await pool.query(
    `SELECT id, name FROM ${schemas.auth}.users WHERE email = $1 AND status = 'active'`,
    [email.toLowerCase().trim()]
  );

  if (!result.rows[0]) {
    // Don't reveal whether email exists
    return NextResponse.json({ sent: true });
  }

  const user = result.rows[0];

  const token = await new SignJWT({ userId: user.id, purpose: "password_reset" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3001";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  // TODO: send resetUrl via email (add RESEND_API_KEY to .env.local to enable)

  return NextResponse.json({ sent: true, resetUrl, name: user.name });
}
