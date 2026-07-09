import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

// Admin verifies an investor's pending bank change. Flips bank_status back to 'verified'.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const result = await pool.query(
    `UPDATE ${schemas.ops}.investor_profiles
       SET bank_status = 'verified'
     WHERE id = $1
     RETURNING id`,
    [id]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, bank_status: "verified" });
}
