import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;
  const { session } = guard;

  const { id } = await params;
  const body = await req.json();

  // Last-admin lockout guard: an admin must not be able to strip their own admin
  // role, or deactivate themselves, if they are the last remaining active admin.
  const isSelf = id === session.userId;
  const demotingSelf = isSelf && body.role !== undefined && body.role !== "admin";
  const deactivatingSelf = isSelf && body.status !== undefined && body.status !== "active";
  if (demotingSelf || deactivatingSelf) {
    const adminCount = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM ${schemas.auth}.users u
       JOIN ${schemas.auth}.roles r ON r.id = u.role_id
       WHERE r.name = 'admin' AND u.status = 'active'`
    );
    if ((adminCount.rows[0]?.n ?? 0) <= 1) {
      return NextResponse.json(
        { error: "You are the last active admin; you cannot remove your own admin access." },
        { status: 400 }
      );
    }
  }

  if (body.role !== undefined) {
    const roleResult = await pool.query(
      `SELECT id FROM ${schemas.auth}.roles WHERE name = $1`,
      [body.role]
    );
    if (!roleResult.rows[0]) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    await pool.query(
      `UPDATE ${schemas.auth}.users SET role_id = $1 WHERE id = $2`,
      [roleResult.rows[0].id, id]
    );
  }

  if (body.status !== undefined) {
    const validStatuses = ["active", "inactive", "suspended"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await pool.query(
      `UPDATE ${schemas.auth}.users SET status = $1 WHERE id = $2`,
      [body.status, id]
    );
  }

  return NextResponse.json({ ok: true });
}
