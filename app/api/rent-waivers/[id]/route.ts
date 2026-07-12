import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

async function canApprove(userId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT can_approve_rent_waivers FROM ${schemas.auth}.users WHERE id = $1`,
    [userId]
  );
  return res.rows[0]?.can_approve_rent_waivers === true;
}

// Approve or reject a pending rent waiver request. Approving is the only path that
// actually moves money: it extends paid_through_date on the assignment by the
// credited days, which is what clears whatever "owed" amount built up while pending.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  if (!(await canApprove(session.userId))) {
    return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { action } = await req.json();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const req_ = await client.query(
      `SELECT assignment_id, non_functional_days FROM ${schemas.ops}.rent_waiver_requests
       WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [id]
    );
    if (!req_.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Request not found or already resolved" }, { status: 404 });
    }

    await client.query(
      `UPDATE ${schemas.ops}.rent_waiver_requests
       SET status = $1, approved_by = $2, approved_at = now()
       WHERE id = $3`,
      [action === "approve" ? "approved" : "rejected", session.name, id]
    );

    if (action === "approve") {
      await client.query(
        `UPDATE ${schemas.ops}.rider_vehicle_assignments
         SET paid_through_date = paid_through_date + $1::int
         WHERE id = $2`,
        [req_.rows[0].non_functional_days, req_.rows[0].assignment_id]
      );
    }

    await client.query("COMMIT");
    await writeAudit({
      action: action === "approve" ? "waiver_approved" : "waiver_rejected",
      entity: "assignment", entityId: req_.rows[0].assignment_id,
      actorId: session.userId, actorName: session.name, req,
      details: { waiver_id: id, non_functional_days: req_.rows[0].non_functional_days },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
