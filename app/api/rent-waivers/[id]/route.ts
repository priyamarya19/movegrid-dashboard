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
// actually moves money: it credits the waived days' VALUE to the assignment,
// which reduces what the rider owes without shifting their rent week.
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
      // A waiver is a DISCOUNT, not free days.
      //
      // It used to move paid_through_date forward, which handed the rider the
      // waived days as coverage — and shifted their whole cycle with it. Two
      // waived days meant their collection day fell two days later, for ever,
      // and again on the next waiver. Shashank's had drifted a week and a half.
      //
      // Ops' rule (Priyam, 1 Sep 2026): the rent week never moves. Week 1–7
      // stays 1–7 and the next is still 8–14; what changes is that the rider
      // hands over two days less cash for the week the vehicle was down.
      //
      // Crediting rupees does exactly that, and needs no other change:
      //   * paid_through_date does not move, so the weeks stay put
      //   * outstandingSql already subtracts rent_credit, so the amount due
      //     drops the moment it is approved
      //   * recordRentPayment already does payment + rent_credit before
      //     dividing into days, so ₹1,200 cash + ₹480 credit still buys the
      //     full 7 days and the next week starts on schedule
      //
      // Fractional days need no special handling any more — 1.5 days is simply
      // 1.5 × the rate. The old whole-day rounding only existed because a date
      // cannot move half a day.
      const asgn = await client.query(
        `SELECT daily_rent, rent_credit FROM ${schemas.ops}.rider_vehicle_assignments
         WHERE id = $1 FOR UPDATE`,
        [req_.rows[0].assignment_id]
      );
      const dailyRent = Number(asgn.rows[0]?.daily_rent) || 0;
      const days = Number(req_.rows[0].non_functional_days) || 0;
      const waivedValue = Math.round(days * dailyRent * 100) / 100;

      await client.query(
        `UPDATE ${schemas.ops}.rider_vehicle_assignments
         SET rent_credit = COALESCE(rent_credit, 0) + $1
         WHERE id = $2`,
        [waivedValue, req_.rows[0].assignment_id]
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
