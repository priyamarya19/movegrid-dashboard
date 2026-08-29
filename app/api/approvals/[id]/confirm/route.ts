import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { confirmApproval } from "@/lib/approvals";

// Ops typing in the code the admin read out to them.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const { code } = await req.json().catch(() => ({ code: "" }));
  if (!code) return NextResponse.json({ error: "Enter the code" }, { status: 400 });

  const res = await confirmApproval({ id, code: String(code) });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, approved_by: res.approvedBy });
}
