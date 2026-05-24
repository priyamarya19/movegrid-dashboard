import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  let query = `SELECT id, action, entity, entity_id, actor_id, details, ip_address, created_at
               FROM ${schemas.logs}.audit_logs WHERE 1=1`;
  const params: string[] = [];
  if (action) { params.push(action); query += ` AND action = $${params.length}`; }
  query += ` ORDER BY created_at DESC LIMIT 200`;

  const result = await pool.query(query, params);
  return NextResponse.json(result.rows);
}
