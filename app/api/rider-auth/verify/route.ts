import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { hashOtp, mobileCore, signRiderToken, signTesterToken, TEST_MOBILE, TEST_OTP, testLoginEnabled } from "@/lib/riderAuth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// POST /api/rider-auth/verify { mobile, otp } — complete a rider login.
// 5 wrong attempts consume the challenge; a fresh OTP must be requested.
export async function POST(req: NextRequest) {
  const { mobile, otp } = await req.json();
  const core = mobileCore(mobile ?? "");
  if (core.length !== 10 || !otp) {
    return NextResponse.json({ error: "Mobile and OTP are required" }, { status: 400 });
  }

  // UAT tester login → short-lived tester token; the app then shows the rider
  // picker (/test-riders → /test-login). Schema-gated, impossible in prod.
  if (core === TEST_MOBILE && testLoginEnabled()) {
    if (String(otp).trim() !== TEST_OTP) {
      return NextResponse.json({ error: "Incorrect code, try again", code: "otp_wrong" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, tester: true, token: await signTesterToken(), name: "Tester" });
  }

  const rl = rateLimit(`rider-verify:${core}:${clientIp(req)}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const S = schemas.ops;
  const challenge = await pool.query(
    `SELECT id, otp_hash, attempts FROM ${S}.rider_otps
     WHERE mobile = $1 AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [core]
  );
  const ch = challenge.rows[0];
  if (!ch) {
    return NextResponse.json({ error: "Code expired — request a new one", code: "otp_expired" }, { status: 400 });
  }

  if (ch.otp_hash !== hashOtp(core, String(otp).trim())) {
    const attempts = Number(ch.attempts) + 1;
    await pool.query(
      `UPDATE ${S}.rider_otps SET attempts = $1, consumed_at = CASE WHEN $1 >= 5 THEN now() ELSE consumed_at END WHERE id = $2`,
      [attempts, ch.id]
    );
    return NextResponse.json(
      { error: attempts >= 5 ? "Too many wrong codes — request a new one" : "Incorrect code, try again", code: "otp_wrong" },
      { status: 400 }
    );
  }

  await pool.query(`UPDATE ${S}.rider_otps SET consumed_at = now() WHERE id = $1`, [ch.id]);

  const rider = await pool.query(
    `SELECT id, name, mobile, token_version, COALESCE(is_blacklisted, false) AS blacklisted
     FROM ${S}.riders WHERE RIGHT(REGEXP_REPLACE(mobile, '\\D', '', 'g'), 10) = $1 LIMIT 1`,
    [core]
  );
  if (rider.rows[0]?.blacklisted) {
    return NextResponse.json({ error: "This number cannot be used. Contact your hub." }, { status: 403 });
  }

  let r = rider.rows[0];
  let newRider = false;
  if (!r) {
    // Open registration: a verified unknown mobile becomes a rider account on the
    // spot — mobile-only signup, KYC follows inside the app. Name placeholder is
    // replaced by the KYC wizard's first save.
    const created = await pool.query(
      `INSERT INTO ${S}.riders (name, mobile, status, rider_code)
       VALUES ('New Rider', $1, 'pending', 'MGR' || LPAD(NEXTVAL('${S}.rider_code_seq')::TEXT, 6, '0'))
       RETURNING id, name, token_version`,
      [core]
    );
    r = created.rows[0];
    newRider = true;
  }

  const token = await signRiderToken({
    kind: "rider", riderId: r.id, mobile: core, name: r.name, tv: Number(r.token_version ?? 0),
  });
  return NextResponse.json({ ok: true, token, name: r.name, new_rider: newRider });
}
