import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export const REPORT_KEYS = ["fleet_status", "rent_due"] as const;

// GET /api/settings/report-recipients — all (report_key, email, enabled) rows, admin only.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;
  const res = await pool.query(
    `SELECT id, report_key, email, enabled FROM ${schemas.ops}.report_recipients ORDER BY email, report_key`
  );
  return NextResponse.json(res.rows);
}

// POST /api/settings/report-recipients — upsert a checkbox: { email, report_key, enabled }.
export async function POST(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;
  const { email, report_key, enabled } = await req.json();
  if (!email || !REPORT_KEYS.includes(report_key)) {
    return NextResponse.json({ error: "email and a valid report_key are required" }, { status: 400 });
  }
  await pool.query(
    `INSERT INTO ${schemas.ops}.report_recipients (report_key, email, enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (report_key, email) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [report_key, email, enabled !== false]
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/settings/report-recipients?email=... — remove an email from every report.
export async function DELETE(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  await pool.query(`DELETE FROM ${schemas.ops}.report_recipients WHERE email = $1`, [email]);
  return NextResponse.json({ ok: true });
}
