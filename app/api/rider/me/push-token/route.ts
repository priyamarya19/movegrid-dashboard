import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// Register (or refresh) this device's Expo push token.
//
// The token is UNIQUE across riders, not per rider: a handset that gets resold
// or handed to a colleague must follow the new rider, never notify both. So an
// existing token row is reassigned rather than duplicated.
export async function POST(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;

  const b = await req.json().catch(() => ({}));
  const token = typeof b.token === "string" ? b.token.trim() : "";
  const platform = typeof b.platform === "string" ? b.platform.slice(0, 20) : null;

  // Expo tokens look like ExponentPushToken[xxxxxxxx] — reject anything else
  // rather than storing junk we'd later try to send to.
  if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
    return NextResponse.json({ error: "Invalid push token", code: "bad_token" }, { status: 400 });
  }

  await pool.query(
    `INSERT INTO ${schemas.ops}.rider_push_tokens (rider_id, token, platform, last_seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (token) DO UPDATE
       SET rider_id = EXCLUDED.rider_id,
           platform = EXCLUDED.platform,
           last_seen_at = now()`,
    [guard.rider.riderId, token, platform]
  );

  return NextResponse.json({ ok: true });
}

// Called on sign-out so a shared phone stops receiving the previous rider's
// notifications.
export async function DELETE(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;

  const b = await req.json().catch(() => ({}));
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  await pool.query(
    `DELETE FROM ${schemas.ops}.rider_push_tokens WHERE token = $1 AND rider_id = $2`,
    [token, guard.rider.riderId]
  );
  return NextResponse.json({ ok: true });
}
