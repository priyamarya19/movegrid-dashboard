import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback_secret");

export async function POST(req: Request) {
  const { token, password } = await req.json();

  if (!token || !password) {
    return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const { payload } = await jwtVerify(token, secret);

    if (payload.purpose !== "password_reset" || !payload.userId) {
      return NextResponse.json({ error: "Invalid reset token" }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `UPDATE ${schemas.auth}.users SET password_hash = $1 WHERE id = $2 AND status = 'active' RETURNING id`,
      [hash, payload.userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "User not found or inactive" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid or expired reset link. Please request a new one." }, { status: 400 });
  }
}
