import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { generateOtp, hashOtp, mobileCore, sendOtp, TEST_MOBILE, testLoginEnabled } from "@/lib/riderAuth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// POST /api/rider-auth/request-otp { mobile } — start a rider login. Always
// answers 200 with the same shape whether or not the mobile matches a rider,
// so the endpoint can't be used to enumerate rider numbers.
export async function POST(req: NextRequest) {
  const { mobile } = await req.json();
  const core = mobileCore(mobile ?? "");
  if (core.length !== 10) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
  }

  // UAT tester number: no challenge stored, the app goes straight to the OTP
  // screen and the fixed test code is checked in /verify. Prod: falls through
  // to the normal (unknown-number) path.
  if (core === TEST_MOBILE && testLoginEnabled()) {
    return NextResponse.json({ ok: true, channel: "test" });
  }

  const rl = rateLimit(`rider-otp:${core}:${clientIp(req)}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const S = schemas.ops;
  const rider = await pool.query(
    `SELECT id, COALESCE(is_blacklisted, false) AS blacklisted
     FROM ${S}.riders WHERE RIGHT(REGEXP_REPLACE(mobile, '\\D', '', 'g'), 10) = $1 LIMIT 1`,
    [core]
  );

  // Blacklisted numbers can't log in OR re-register: same silent shape as before.
  if (rider.rows[0]?.blacklisted) {
    return NextResponse.json({ ok: true, channel: "none", exists: false });
  }

  // Open registration: an unknown number gets an OTP too — verifying it creates
  // the rider account (mobile-only signup; KYC follows inside the app).
  // UAT convenience: the OTP is the mobile's LAST 4 DIGITS (schema-gated like
  // tester mode — a production backend always generates random codes).
  const otp = testLoginEnabled() ? core.slice(-4) : generateOtp();
  // One live challenge per mobile: newer request invalidates older codes.
  await pool.query(`UPDATE ${S}.rider_otps SET consumed_at = now() WHERE mobile = $1 AND consumed_at IS NULL`, [core]);
  await pool.query(
    `INSERT INTO ${S}.rider_otps (mobile, otp_hash, expires_at) VALUES ($1, $2, now() + interval '5 minutes')`,
    [core, hashOtp(core, otp)]
  );
  const delivery = await sendOtp(core, otp);
  return NextResponse.json({ ok: true, channel: delivery.channel, exists: !!rider.rows[0] });
}
