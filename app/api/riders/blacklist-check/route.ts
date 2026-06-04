import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const aadhaar = new URL(req.url).searchParams.get("aadhaar");
  if (!aadhaar) return NextResponse.json({ blacklisted: false });

  const res = await pool.query(
    `SELECT is_blacklisted, blacklist_reason FROM ${schemas.ops}.riders WHERE aadhaar = $1 AND is_blacklisted = true LIMIT 1`,
    [aadhaar]
  );
  if (res.rows[0]) {
    return NextResponse.json({ blacklisted: true, reason: res.rows[0].blacklist_reason });
  }
  return NextResponse.json({ blacklisted: false });
}
