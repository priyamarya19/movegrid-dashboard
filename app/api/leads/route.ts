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
  const q = (searchParams.get("q") || "").trim();
  const pageParam = searchParams.get("page");
  const paginated = pageParam != null;
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));

  let where = "WHERE 1=1";
  const params: string[] = [];

  // ops_manager cannot see investor leads
  if (session.role === "ops_manager") {
    where += ` AND type != 'investor'`;
  }
  if (type) { params.push(type); where += ` AND type = $${params.length}`; }
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  if (q) { params.push(`%${q}%`); const p = `$${params.length}`; where += ` AND (name ILIKE ${p} OR phone ILIKE ${p} OR email ILIKE ${p})`; }

  let query = `SELECT id, type, name, phone, email, city, fleet_size, amount, status, created_at
               FROM ${schemas.leads}.leads ${where} ORDER BY created_at DESC`;
  query += paginated ? ` LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}` : ` LIMIT 100`;

  const [result, countRes] = await Promise.all([
    pool.query(query, params),
    pool.query(`SELECT count(*)::int AS n FROM ${schemas.leads}.leads ${where}`, params),
  ]);
  return NextResponse.json(result.rows, { headers: { "X-Total-Count": String(countRes.rows[0]?.n ?? result.rows.length) } });
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
