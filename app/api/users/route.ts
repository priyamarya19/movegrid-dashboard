import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  const result = await pool.query(`
    SELECT u.id, u.name, u.email, u.mobile, u.status, u.created_at,
           u.can_approve_rent_waivers,
           r.name AS role
    FROM ${schemas.auth}.users u
    LEFT JOIN ${schemas.auth}.roles r ON r.id = u.role_id
    ORDER BY u.created_at DESC
  `);

  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  const { name, email, mobile, password, role } = await req.json();

  if (!name || !email || !mobile || !password || !role) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  const roleResult = await pool.query(
    `SELECT id FROM ${schemas.auth}.roles WHERE name = $1`,
    [role]
  );
  if (!roleResult.rows[0]) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(`
      INSERT INTO ${schemas.auth}.users (name, email, mobile, password_hash, role_id, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING id, name, email, mobile, status, created_at
    `, [name, email.toLowerCase().trim(), mobile, password_hash, roleResult.rows[0].id]);

    return NextResponse.json({ ...result.rows[0], role }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "23505") {
      return NextResponse.json({ error: "Email or mobile already exists" }, { status: 409 });
    }
    throw err;
  }
}
