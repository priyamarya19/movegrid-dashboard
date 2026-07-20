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
      // Waiver days can be fractional (1.5) but paid_through_date only moves in
      // whole days — the sub-day remainder is kept as an ₹ credit (rent_credit)
      // on the assignment, which the next recorded payment folds in. An earlier
      // remainder already sitting in rent_credit is combined first, so two half-
      // day waivers add up to a full extra day rather than being lost.
      const asgn = await client.query(
        `SELECT daily_rent, rent_credit FROM ${schemas.ops}.rider_vehicle_assignments
         WHERE id = $1 FOR UPDATE`,
        [req_.rows[0].assignment_id]
      );
      const dailyRent = Number(asgn.rows[0]?.daily_rent) || 0;
      const days = Number(req_.rows[0].non_functional_days);
      let wholeDays: number, newCredit: number;
      if (dailyRent > 0) {
        const total = days * dailyRent + (Number(asgn.rows[0]?.rent_credit) || 0);
        wholeDays = Math.floor(total / dailyRent + 1e-9);
        newCredit = Math.max(0, Math.round((total - wholeDays * dailyRent) * 100) / 100);
      } else {
        // No daily rate to value a fraction with — credit the whole days only.
        wholeDays = Math.floor(days);
        newCredit = Number(asgn.rows[0]?.rent_credit) || 0;
      }
      await client.query(
        `UPDATE ${schemas.ops}.rider_vehicle_assignments
         SET paid_through_date = COALESCE(paid_through_date, assigned_date - 1) + $1::int,
             rent_credit = $2
         WHERE id = $3`,
        [wholeDays, newCredit, req_.rows[0].assignment_id]
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
