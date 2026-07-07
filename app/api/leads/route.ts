import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin", "ops_manager"]);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");

  let query = `SELECT id, type, name, phone, email, city, fleet_size, amount, status, created_at
               FROM ${schemas.leads}.leads WHERE 1=1`;
  const params: string[] = [];

  // ops_manager cannot see investor leads
  if (session.role === "ops_manager") {
    query += ` AND type != 'investor'`;
  }

  if (type) { params.push(type); query += ` AND type = $${params.length}`; }
  if (status) { params.push(status); query += ` AND status = $${params.length}`; }

  query += ` ORDER BY created_at DESC LIMIT 100`;

  const result = await pool.query(query, params);
  return NextResponse.json(result.rows);
}

export async function PATCH(req: NextRequest) {
  const guard = await requireRole(req, ["admin", "ops_manager"]);
  if ("response" in guard) return guard.response;

  const { id, status } = await req.json();
  const valid = ["new", "contacted", "converted", "rejected"];
  if (!valid.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  await pool.query(
    `UPDATE ${schemas.leads}.leads SET status = $1 WHERE id = $2`,
    [status, id]
  );

  return NextResponse.json({ success: true });
}
