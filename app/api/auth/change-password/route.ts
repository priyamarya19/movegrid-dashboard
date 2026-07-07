import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const { currentPassword, newPassword } = await req.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const result = await pool.query(
    `SELECT password_hash FROM ${schemas.auth}.users WHERE id = $1`,
    [session.userId]
  );
  if (!result.rows[0]) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    `UPDATE ${schemas.auth}.users SET password_hash = $1 WHERE id = $2`,
    [hash, session.userId]
  );

  return NextResponse.json({ success: true });
}
