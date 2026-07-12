import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Null session -> 401 (auth contract); valid session, wrong role -> 403.
  const guard = await requireRole(req, ["admin", "ops_manager"]);
  if ("response" in guard) return guard.response;
  const session = guard.session;
  const { id } = await params;
  const { reason } = await req.json();

  await pool.query(
    `UPDATE ${schemas.ops}.riders SET is_blacklisted = true, blacklist_reason = $1, blacklisted_at = NOW(), blacklisted_by = $2 WHERE id = $3`,
    [reason ?? null, session.name, id]
  );
  await writeAudit({ action: "rider_blacklisted", entity: "rider", entityId: id, actorId: session.userId, actorName: session.name, req, details: { reason: reason ?? null } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Null session -> 401 (auth contract); valid session, wrong role -> 403.
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;
  const session = guard.session;
  const { id } = await params;
  await pool.query(
    `UPDATE ${schemas.ops}.riders SET is_blacklisted = false, blacklist_reason = NULL, blacklisted_at = NULL, blacklisted_by = NULL WHERE id = $1`,
    [id]
  );
  await writeAudit({ action: "rider_unblacklisted", entity: "rider", entityId: id, actorId: session.userId, actorName: session.name, req });
  return NextResponse.json({ ok: true });
}
