import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const { reason } = await req.json();

  await pool.query(
    `UPDATE ${schemas.ops}.riders SET is_blacklisted = true, blacklist_reason = $1, blacklisted_at = NOW(), blacklisted_by = $2 WHERE id = $3`,
    [reason ?? null, session.name, id]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session || !["admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  await pool.query(
    `UPDATE ${schemas.ops}.riders SET is_blacklisted = false, blacklist_reason = NULL, blacklisted_at = NULL, blacklisted_by = NULL WHERE id = $1`,
    [id]
  );
  return NextResponse.json({ ok: true });
}
