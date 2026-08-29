import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

/**
 * POST /api/rider-tickets/auto-close — nightly.
 *
 * Closing needs the rider's yes, which means a rider who never answers leaves
 * the ticket parked forever and the queue stops meaning anything. After a week
 * of silence we take it as settled and say so in the thread, so the rider can
 * see why it closed and raise a fresh one if it wasn't.
 *
 * Silence is measured from the LAST message, not the close request: ops asking
 * again restarts the week, which is the fair reading of "no response".
 */
const SILENCE_DAYS = 7;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("X-Cron-Secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const due = await client.query(
      `SELECT t.id
         FROM ${schemas.ops}.rider_tickets t
        WHERE t.status = 'pending_closure'
          AND COALESCE(
                (SELECT MAX(m.created_at) FROM ${schemas.ops}.rider_ticket_messages m WHERE m.ticket_id = t.id),
                t.close_requested_at
              ) < now() - ($1 || ' days')::interval
        FOR UPDATE`,
      [String(SILENCE_DAYS)]
    );

    for (const t of due.rows) {
      await client.query(
        `INSERT INTO ${schemas.ops}.rider_ticket_messages (ticket_id, author, body, kind)
         VALUES ($1, 'system', $2, 'auto_closed')`,
        [t.id, `Closed automatically after ${SILENCE_DAYS} days with no reply. Raise a new request if it is still a problem.`]
      );
      await client.query(
        `UPDATE ${schemas.ops}.rider_tickets
            SET status = 'resolved', resolved_at = now(), resolved_by = 'Auto-closed',
                close_requested_at = NULL, close_requested_by = NULL
          WHERE id = $1`,
        [t.id]
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, closed: due.rows.length });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
