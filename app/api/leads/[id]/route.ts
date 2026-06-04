import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  const [lead, comments] = await Promise.all([
    pool.query(`SELECT * FROM ${schemas.leads}.leads WHERE id = $1`, [id]),
    pool.query(
      `SELECT id, author_name, author_role, comment, created_at
       FROM ${schemas.leads}.lead_comments
       WHERE lead_id = $1
       ORDER BY created_at ASC`,
      [id]
    ),
  ]);

  if (!lead.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ lead: lead.rows[0], comments: comments.rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { comment } = body;

  if (!comment?.trim()) {
    return NextResponse.json({ error: "Comment is required" }, { status: 400 });
  }

  const result = await pool.query(
    `INSERT INTO ${schemas.leads}.lead_comments (lead_id, author_name, author_role, comment)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, session.name, session.role, comment.trim()]
  );

  return NextResponse.json(result.rows[0]);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const { status } = await req.json();

  const result = await pool.query(
    `UPDATE ${schemas.leads}.leads SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );

  return NextResponse.json(result.rows[0]);
}
