import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const pageParam = searchParams.get("page");
  const paginated = pageParam != null;
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));

  let where = "WHERE 1=1";
  const params: string[] = [];
  if (action) { params.push(action); where += ` AND action = $${params.length}`; }

  let query = `SELECT id, action, entity, entity_id, actor_id, details, ip_address, created_at
               FROM ${schemas.logs}.audit_logs ${where} ORDER BY created_at DESC`;
  query += paginated ? ` LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}` : ` LIMIT 200`;

  const [result, countRes] = await Promise.all([
    pool.query(query, params),
    pool.query(`SELECT count(*)::int AS n FROM ${schemas.logs}.audit_logs ${where}`, params),
  ]);
  return NextResponse.json(result.rows, { headers: { "X-Total-Count": String(countRes.rows[0]?.n ?? result.rows.length) } });
}
