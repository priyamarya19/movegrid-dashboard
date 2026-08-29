import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

/**
 * POST /api/rider/me/tickets/[id]/messages — the rider writing back.
 *
 * The thing the old design had no room for at all: a rider could raise a
 * question and read one answer, and that was the end of it. "it should open a
 * chat box kind of page and rider should be able to reply till it's resolved."
 *
 * A reply also un-parks a ticket that ops had asked to close — if the rider is
 * still typing, it plainly is not sorted.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const riderId = guard.rider.riderId;
  const { id } = await params;

  const b = await req.json().catch(() => ({}));
  const body = typeof b.message === "string" ? b.message.trim() : "";
  const mediaUrl = typeof b.media_url === "string" && b.media_url ? b.media_url : null;
  const mediaType = b.media_type === "image" || b.media_type === "video" ? b.media_type : null;

  if (!body && !mediaUrl) {
    return NextResponse.json({ error: "Write something first", code: "message_required" }, { status: 400 });
  }
  if (body.length > 2000) {
    return NextResponse.json({ error: "Message is too long", code: "message_too_long" }, { status: 400 });
  }
  if ((mediaUrl && !mediaType) || (mediaType && !mediaUrl)) {
    return NextResponse.json({ error: "Attachment is incomplete", code: "bad_media" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Scoped to this rider — a ticket id is not a capability.
    const t = await client.query(
      `SELECT id, status FROM ${schemas.ops}.rider_tickets WHERE id = $1 AND rider_id = $2 FOR UPDATE`,
      [id, riderId]
    );
    if (!t.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (t.rows[0].status === "resolved") {
      // Closed is closed. Raising a new one keeps the history honest and stops a
      // months-old thread being revived to mean something else.
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "This request is closed — please raise a new one", code: "ticket_resolved" },
        { status: 409 }
      );
    }

    await client.query(
      `INSERT INTO ${schemas.ops}.rider_ticket_messages (ticket_id, author, body, media_url, media_type)
       VALUES ($1, 'rider', $2, $3, $4)`,
      [id, body || null, mediaUrl, mediaType]
    );
    // Still talking, so it is still open.
    await client.query(
      `UPDATE ${schemas.ops}.rider_tickets
          SET status = 'open', close_requested_at = NULL, close_requested_by = NULL
        WHERE id = $1`,
      [id]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, status: "open" }, { status: 201 });
}
