import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

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
