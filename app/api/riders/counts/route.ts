import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

// GET /api/riders/counts — exact rider counts by status, straight from SQL.
// The app's Home stat cards use this instead of counting a (capped) list
// response, so the numbers stay right at any fleet size.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;

  const res = await pool.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'active')::int AS active,
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'inactive')::int AS inactive
    FROM ${schemas.ops}.riders`);

  return NextResponse.json(res.rows[0]);
}
