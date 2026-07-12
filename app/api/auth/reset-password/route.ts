import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { JWT_SECRET as secret } from "@/lib/jwt";

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

    if (payload.purpose !== "password_reset" || !payload.userId || typeof payload.iat !== "number") {
      return NextResponse.json({ error: "Invalid reset token" }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);

    // Single-use enforcement: apply the reset only if this token was issued at or
    // after the account's last password change. A successful reset stamps
    // password_changed_at = now(), so replaying this same token — or any older
    // outstanding reset link — fails the freshness guard and updates zero rows.
    // Doing it in one atomic UPDATE avoids a check-then-write race.
    //
    // Bumping token_version revokes every existing login session: a password reset
    // should sign the user out everywhere (see isSessionCurrent in lib/auth). Both
    // columns come from scripts/add-session-revocation.js — that migration must be
    // run on the target schema (auth / uat_auth) for this route to work.
    const result = await pool.query(
      `UPDATE ${schemas.auth}.users
          SET password_hash = $1,
              password_changed_at = now(),
              token_version = token_version + 1
        WHERE id = $2
          AND status = 'active'
          AND (password_changed_at IS NULL OR extract(epoch FROM password_changed_at) <= $3)
      RETURNING id`,
      [hash, payload.userId, payload.iat]
    );

    if (!result.rows[0]) {
      // Either the account is inactive/missing, or the token was already used /
      // superseded by a newer link. Don't distinguish, and don't reveal existence.
      return NextResponse.json(
        { error: "This reset link is no longer valid. Please request a new one." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid or expired reset link. Please request a new one." }, { status: 400 });
  }
}
