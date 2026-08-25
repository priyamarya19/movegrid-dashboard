import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, userHasAppPage } from "@/lib/auth";
import { getHubScope, scopeAllowsHub } from "@/lib/hubScope";
import { writeAudit } from "@/lib/audit";
import { pushToRiderAsync } from "@/lib/riderPush";

// PATCH /api/rider-tickets/[id] — resolve a ticket (or reopen it).
//
// Resolving requires a note: the rider sees it in their app, so "resolved"
// with no explanation is worse than leaving it open.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { userId, role, name } = guard.session;

  if (role !== "admin" && !(await userHasAppPage(userId, "rider_tickets"))) {
    return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const action: "reply" | "reopen" | "resolve" =
    b.action === "reopen" ? "reopen" : b.action === "reply" ? "reply" : "resolve";

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

  if (action === "reopen") {
    await pool.query(
      `UPDATE ${schemas.ops}.rider_tickets
       SET status = 'open', resolved_at = NULL, resolved_by = NULL
       WHERE id = $1`,
      [id]
    );
  } else if (action === "reply") {
    // Answer without closing. Support is a conversation, and "reply" used to be
    // the same button as "resolve", so every answer shut the ticket.
    //
    // Interim: one note field, so a second reply replaces the first. The
    // threaded version keeps every message as its own row.
    const note = typeof b.resolution_note === "string" ? b.resolution_note.trim() : "";
    if (note.length < 3) {
      return NextResponse.json(
        { error: "Write a reply — the rider sees this", code: "note_required" },
        { status: 400 }
      );
    }
    await pool.query(
      `UPDATE ${schemas.ops}.rider_tickets
       SET resolution_note = $2, status = 'open', resolved_at = NULL, resolved_by = NULL
       WHERE id = $1`,
      [id, note]
    );
  } else {
    const note = typeof b.resolution_note === "string" ? b.resolution_note.trim() : "";
    if (note.length < 3) {
      return NextResponse.json(
        { error: "Add a note — the rider sees this", code: "note_required" },
        { status: 400 }
      );
    }
    await pool.query(
      `UPDATE ${schemas.ops}.rider_tickets
       SET status = 'resolved', resolution_note = $2, resolved_by = $3, resolved_at = now()
       WHERE id = $1`,
      [id, note, name]
    );
  }

  await writeAudit({
    action:
      action === "reopen"
        ? "rider_ticket_reopened"
        : action === "reply"
          ? "rider_ticket_replied"
          : "rider_ticket_resolved",
    entity: "rider_ticket",
    entityId: id,
    actorId: userId,
    actorName: name,
    req,
    details: { rider_id: existing.rows[0].rider_id },
  });

  // A reply is worth a notification too — that's the whole point of answering
  // without closing.
  if (action === "resolve" || action === "reply") {
    pushToRiderAsync(existing.rows[0].rider_id, "ticket_answered");
  }

  return NextResponse.json({ ok: true, status: action === "resolve" ? "resolved" : "open" });
}
