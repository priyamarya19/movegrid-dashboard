import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

// Rider-app authentication, kept fully separate from staff auth (lib/auth.ts):
// riders authenticate by mobile + OTP and get a JWT with kind:'rider'. A staff
// token can never pass requireRider and vice versa — different audiences,
// different trust boundaries.

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const RIDER_TOKEN_DAYS = 30;

export type RiderJWT = { kind: "rider"; riderId: string; mobile: string; name: string; tv: number };

export async function signRiderToken(payload: RiderJWT) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${RIDER_TOKEN_DAYS}d`)
    .sign(secret);
}

// Guard for /api/rider/* routes: Bearer token with kind:'rider', checked live
// against the rider's token_version (bump it to revoke all their sessions) and
// active/blacklist status.
export async function requireRider(
  req: NextRequest
): Promise<{ rider: RiderJWT } | { response: NextResponse }> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return { response: NextResponse.json({ error: "Unauthorized", code: "no_token" }, { status: 401 }) };
  }
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.kind !== "rider" || !payload.riderId) throw new Error("wrong kind");
    const res = await pool.query(
      `SELECT token_version, is_blacklisted FROM ${schemas.ops}.riders WHERE id = $1`,
      [payload.riderId]
    );
    const row = res.rows[0];
    if (!row || row.is_blacklisted === true) throw new Error("revoked");
    if (Number(row.token_version ?? 0) !== Number(payload.tv ?? 0)) throw new Error("revoked");
    return { rider: payload as unknown as RiderJWT };
  } catch (err) {
    const expired = (err as { code?: string })?.code === "ERR_JWT_EXPIRED";
    return {
      response: NextResponse.json(
        { error: "Unauthorized", code: expired ? "token_expired" : "invalid_token" },
        { status: 401 }
      ),
    };
  }
}

// ---- OTP challenge helpers ----

export function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits, no leading-zero ambiguity
}

export function hashOtp(mobile: string, otp: string): string {
  return crypto.createHash("sha256").update(`${mobile}:${otp}:${process.env.JWT_SECRET}`).digest("hex");
}

// Normalise Indian mobiles to their 10-digit core so "+91 98765...", "098765..."
// and "98765..." all match the riders table regardless of stored formatting.
export function mobileCore(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// ---- OTP delivery (pluggable) ----
//
// India SMS needs DLT registration and the Twilio account currently only has the
// WhatsApp sandbox, so delivery is env-driven:
//   RIDER_OTP_CHANNEL=whatsapp  → Twilio WhatsApp (sandbox now, Business later)
//   RIDER_OTP_CHANNEL=sms       → Twilio SMS (once a DLT-registered sender exists)
//   RIDER_OTP_CHANNEL=dev       → no send; verify screen tells the team to share it
// Swapping channel is config, not code.
export async function sendOtp(mobile: string, otp: string): Promise<{ sent: boolean; channel: string }> {
  const channel = process.env.RIDER_OTP_CHANNEL ?? "dev";
  const body = `MOVEGRID login code: ${otp}. Valid for 5 minutes. Do not share it.`;

  if ((channel === "whatsapp" || channel === "sms") && process.env.TWILIO_SID && process.env.TWILIO_AUTH) {
    const to = channel === "whatsapp" ? `whatsapp:+91${mobile}` : `+91${mobile}`;
    const from = channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886" : process.env.TWILIO_SMS_FROM ?? "";
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${process.env.TWILIO_SID}:${process.env.TWILIO_AUTH}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Body: body, From: from, To: to }).toString(),
      }
    );
    return { sent: resp.ok, channel };
  }

  // dev channel: OTP stays in the DB only; ops can read it to a pilot rider.
  console.log(`[rider-otp] dev channel — OTP for ${mobile}: ${otp}`);
  return { sent: false, channel: "dev" };
}
