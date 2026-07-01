import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

// GET /api/auth/profile — the logged-in user's own profile.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await pool.query(
    `SELECT u.id, u.name, u.email, u.mobile, u.photo_url, r.name AS role
     FROM ${schemas.auth}.users u
     LEFT JOIN ${schemas.auth}.roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [session.userId]
  );
  if (!res.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(res.rows[0]);
}

// PATCH /api/auth/profile — update your own name / mobile / photo.
export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, mobile, photo_url } = await req.json();

  const sets: string[] = [];
  const vals: (string | null)[] = [];
  if (name !== undefined) { vals.push(name); sets.push(`name = $${vals.length}`); }
  if (mobile !== undefined) { vals.push(mobile); sets.push(`mobile = $${vals.length}`); }
  if (photo_url !== undefined) { vals.push(photo_url); sets.push(`photo_url = $${vals.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  vals.push(session.userId);
  await pool.query(`UPDATE ${schemas.auth}.users SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);

  return NextResponse.json({ success: true });
}
