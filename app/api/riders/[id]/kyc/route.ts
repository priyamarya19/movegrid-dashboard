import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

const validDocs = ["aadhaar", "pan", "dl"] as const;
type Doc = typeof validDocs[number];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Null session -> 401 (auth contract); valid session, wrong role -> 403.
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const { id } = await params;
  const { document, verified } = await req.json() as { document: Doc; verified: boolean };

  if (!validDocs.includes(document)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }

  const verifiedByCol = `${document}_verified_by`;
  const verifiedAtCol = `${document}_verified_at`;
  const verifiedCol = `${document}_verified`;

  await pool.query(
    `UPDATE ${schemas.ops}.riders
     SET ${verifiedCol} = $1,
         ${verifiedByCol} = $2,
         ${verifiedAtCol} = $3
     WHERE id = $4`,
    [verified, verified ? session.name : null, verified ? new Date() : null, id]
  );

  return NextResponse.json({ ok: true, verified, verified_by: verified ? session.name : null });
}
