import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

/**
 * POST /api/rider/me/tickets/[id]/close — the rider's yes or no.
 *
 * Ops ask; the rider decides. `{ approve: true }` closes it, `{ approve: false }`
 * sends it back to ops with the reason, if they gave one.
 *
 * Only valid while ops are actually waiting: a rider cannot close a ticket
 * nobody asked about, which keeps "resolved" meaning "both sides agreed".
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const riderId = guard.rider.riderId;
  const { id } = await params;

  const b = await req.json().catch(() => ({}));
  const approve = b.approve === true;
  const note = typeof b.message === "string" ? b.message.trim().slice(0, 2000) : "";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query(
      `SELECT id, status FROM ${schemas.ops}.rider_tickets WHERE id = $1 AND rider_id = $2 FOR UPDATE`,
      [id, riderId]
    );
    if (!t.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (t.rows[0].status !== "pending_closure") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Nobody has asked to close this yet", code: "not_pending" },
        { status: 409 }
      );
    }

    await client.query(
      `INSERT INTO ${schemas.ops}.rider_ticket_messages (ticket_id, author, body, kind)
       VALUES ($1, 'rider', $2, $3)`,
      [id, note || null, approve ? "close_approved" : "close_declined"]
    );

    if (approve) {
      await client.query(
        `UPDATE ${schemas.ops}.rider_tickets
            SET status = 'resolved', resolved_at = now(), resolved_by = 'Rider',
                close_requested_at = NULL, close_requested_by = NULL
          WHERE id = $1`,
        [id]
      );
    } else {
      await client.query(
        `UPDATE ${schemas.ops}.rider_tickets
            SET status = 'open', close_requested_at = NULL, close_requested_by = NULL
          WHERE id = $1`,
        [id]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, status: approve ? "resolved" : "open" });
}
