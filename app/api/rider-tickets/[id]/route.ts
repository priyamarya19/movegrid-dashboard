import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, userHasAppPage } from "@/lib/auth";
import { getHubScope, scopeAllowsHub } from "@/lib/hubScope";
import { writeAudit } from "@/lib/audit";
import { pushToRiderAsync } from "@/lib/riderPush";

/**
 * PATCH /api/rider-tickets/[id] — ops' side of a support conversation.
 *
 * Four moves:
 *   reply         answer, ticket stays open
 *   request_close ask the rider if it's sorted; they decide
 *   resolve       close it outright, without asking
 *   reopen        pick a closed one back up
 *
 * Closing is normally the rider's word, not ops': "ops team will raise request
 * to close. and after rider approves it should be marked resolved". `resolve`
 * stays for the cases where waiting makes no sense — a duplicate, a mistake, a
 * rider who has left — and it is recorded as ops closing it, not the rider.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { userId, role, name } = guard.session;

  if (role !== "admin" && !(await userHasAppPage(userId, "rider_tickets"))) {
    return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const ACTIONS = ["reply", "reopen", "resolve", "request_close"] as const;
  type Action = (typeof ACTIONS)[number];
  // Unknown action falls through to resolve, which is how the older ops-app
  // builds behave — they send no action at all and mean "close it".
  const action: Action = (ACTIONS as readonly string[]).includes(b.action) ? (b.action as Action) : "resolve";

  const existing = await pool.query(
    `SELECT hub_id, rider_id, status FROM ${schemas.ops}.rider_tickets WHERE id = $1`,
    [id]
  );
  if (!existing.rows[0]) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // Can't action a ticket from a hub you don't cover.
  const scope = await getHubScope(userId, role);
  if (!scopeAllowsHub(scope, existing.rows[0].hub_id)) {
    return NextResponse.json({ error: "This ticket belongs to another hub", code: "forbidden" }, { status: 403 });
  }

  const note = typeof b.resolution_note === "string" ? b.resolution_note.trim() : "";
  const needsNote = action === "reply" || action === "resolve" || action === "request_close";
  if (needsNote && note.length < 3) {
    return NextResponse.json(
      { error: "Write something — the rider sees this", code: "note_required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  let status = existing.rows[0].status;
  try {
    await client.query("BEGIN");

    const say = (kind: string, body: string | null) =>
      client.query(
        `INSERT INTO ${schemas.ops}.rider_ticket_messages (ticket_id, author, author_name, body, kind)
         VALUES ($1, 'ops', $2, $3, $4)`,
        [id, name, body, kind]
      );

    if (action === "reopen") {
      await client.query(
        `UPDATE ${schemas.ops}.rider_tickets
            SET status = 'open', resolved_at = NULL, resolved_by = NULL,
                close_requested_at = NULL, close_requested_by = NULL
          WHERE id = $1`,
        [id]
      );
      status = "open";
    } else if (action === "reply") {
      await say("message", note);
      // Answering is not closing. This is the bug Priyam hit: one reply used to
      // mark the whole thing resolved.
      await client.query(
        `UPDATE ${schemas.ops}.rider_tickets
            SET status = 'open', resolved_at = NULL, resolved_by = NULL,
                close_requested_at = NULL, close_requested_by = NULL,
                resolution_note = $2
          WHERE id = $1`,
        [id, note]
      );
      status = "open";
    } else if (action === "request_close") {
      await say("close_request", note);
      await client.query(
        `UPDATE ${schemas.ops}.rider_tickets
            SET status = 'pending_closure', close_requested_at = now(), close_requested_by = $2,
                resolution_note = $3
          WHERE id = $1`,
        [id, name, note]
      );
      status = "pending_closure";
    } else {
      await say("message", note);
      await client.query(
        `UPDATE ${schemas.ops}.rider_tickets
            SET status = 'resolved', resolution_note = $2, resolved_by = $3, resolved_at = now(),
                close_requested_at = NULL, close_requested_by = NULL
          WHERE id = $1`,
        [id, note, name]
      );
      status = "resolved";
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  await writeAudit({
    action:
      action === "reopen" ? "rider_ticket_reopened"
      : action === "reply" ? "rider_ticket_replied"
      : action === "request_close" ? "rider_ticket_close_requested"
      : "rider_ticket_resolved",
    entity: "rider_ticket",
    entityId: id,
    actorId: userId,
    actorName: name,
    req,
    details: { rider_id: existing.rows[0].rider_id },
  });

  // A close request is the one the rider most needs to see — nothing happens
  // until they answer it.
  if (action === "request_close") {
    pushToRiderAsync(existing.rows[0].rider_id, "ticket_close_requested", { ticket_id: id });
  } else if (action === "resolve" || action === "reply") {
    pushToRiderAsync(existing.rows[0].rider_id, "ticket_answered", { ticket_id: id });
  }

  return NextResponse.json({ ok: true, status });
}
