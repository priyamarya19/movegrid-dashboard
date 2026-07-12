import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { signToken } from "@/lib/auth";
import { rateLimit, rateLimitReset, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const isMobile = (req as Request & { headers: Headers }).headers.get("X-Client-Type") === "mobile";
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  // Throttle credential stuffing: keyed by email + client IP so one attacker can't
  // grind a single account, and one IP can't spray many accounts.
  const rlKey = `login:${String(email).toLowerCase().trim()}:${clientIp(req)}`;
  const rl = rateLimit(rlKey);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min.`, code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.status, u.token_version, r.name AS role
       FROM ${schemas.auth}.users u
       LEFT JOIN ${schemas.auth}.roles r ON r.id = u.role_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];

    if (!user || user.status !== "active") {
      return NextResponse.json({ error: "Invalid credentials", code: "invalid_credentials" }, { status: 400 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials", code: "invalid_credentials" }, { status: 400 });
    }

    const token = await signToken({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tv: Number(user.token_version ?? 0),
    });

    rateLimitReset(rlKey); // good login — clear the failure counter
    const res = NextResponse.json({ success: true, role: user.role, name: user.name, ...(isMobile ? { token } : {}) });
    res.cookies.set("mg_token", token, {
      httpOnly: true,
      // Secure by default; only an explicit COOKIE_SECURE=false (local http dev)
      // turns it off. Previously this failed open — forget the env var in prod and
      // the session cookie rode plain HTTP.
      secure: process.env.COOKIE_SECURE !== "false",
      sameSite: "lax",
      maxAge: 60 * 60 * 8, // 8 hours
      path: "/",
    });

    return res;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
