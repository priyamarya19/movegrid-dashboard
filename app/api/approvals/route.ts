import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { requestApproval, fingerprint, type ApprovalAction } from "@/lib/approvals";

const ACTIONS: ApprovalAction[] = ["rider_edit", "allotment_start_date"];

// Ops asking an admin to authorise something. Returns only the request id —
// the code goes to the admin's inbox, never back down this response.
export async function POST(req: NextRequest) {
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const b = await req.json().catch(() => ({}));
  const action = b.action as ApprovalAction;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const parts = (b.parts ?? {}) as Record<string, unknown>;
  const summary = typeof b.summary === "string" ? b.summary.trim() : "";
  if (!summary) return NextResponse.json({ error: "summary is required" }, { status: 400 });

  try {
    const { id, sentTo } = await requestApproval({
      action,
      subjectId: b.subject_id ?? null,
      summary,
      fingerprint: fingerprint(action, parts),
      requestedBy: session.userId,
      requestedByName: session.name,
    });
    // Masked so ops can tell the admin "check your mail" without the address
    // itself becoming casually copyable from the screen.
    return NextResponse.json({
      id,
      sent_to: sentTo.map((e) => e.replace(/^(.).*(@.*)$/, "$1•••$2")),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not send the code" }, { status: 400 });
  }
}
