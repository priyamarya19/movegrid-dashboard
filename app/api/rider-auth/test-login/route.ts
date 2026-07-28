import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { mobileCore, requireTester, signRiderToken, testLoginEnabled } from "@/lib/riderAuth";

// POST /api/rider-auth/test-login { rider_id } — exchange a UAT tester session
// for a normal rider token, to browse the app as that rider. Schema-gated:
// impossible on a production backend.
export async function POST(req: NextRequest) {
  if (!testLoginEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = await requireTester(req);
  if ("response" in guard) return guard.response;

  const { rider_id } = await req.json();
  if (!rider_id) return NextResponse.json({ error: "rider_id is required" }, { status: 400 });

  const res = await pool.query(
    `SELECT id, name, mobile, token_version FROM ${schemas.ops}.riders WHERE id = $1`,
    [rider_id]
  );
  if (!res.rows[0]) return NextResponse.json({ error: "Rider not found" }, { status: 404 });
  const r = res.rows[0];

  const token = await signRiderToken({
    kind: "rider", riderId: r.id, mobile: mobileCore(r.mobile ?? ""), name: r.name, tv: Number(r.token_version ?? 0),
  });
  return NextResponse.json({ ok: true, token, name: r.name });
}
