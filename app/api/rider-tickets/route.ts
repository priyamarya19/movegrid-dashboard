import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, userHasAppPage } from "@/lib/auth";
import { getHubScope, hubScopeSql } from "@/lib/hubScope";

// GET /api/rider-tickets — the ops support queue.
//
// Open tickets first (oldest at the top, so nobody waits longest by accident),
// then recently resolved ones for context. Hub-scoped: staff only see tickets
// from the hubs they cover.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { userId, role } = guard.session;

  if (role !== "admin" && !(await userHasAppPage(userId, "rider_tickets"))) {
    return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  const scope = await getHubScope(userId, role);
  const res = await pool.query(`
    SELECT t.id, t.message, t.media_url, t.media_type, t.status, t.resolution_note,
           t.resolved_by,
           to_char(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
           to_char(t.resolved_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS resolved_at,
           EXTRACT(EPOCH FROM (now() - t.created_at))::int / 3600 AS age_hours,
           to_char(t.close_requested_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS close_requested_at,
           t.close_requested_by,
           r.id AS rider_id, r.name AS rider_name, r.rider_code, r.mobile,
           v.ev_number,
           -- The whole conversation, inline. Volumes are small (one hub, a few
           -- tickets a week) and the queue is useless without the thread.
           COALESCE(m.messages, '[]'::json) AS messages
    FROM ${schemas.ops}.rider_tickets t
    JOIN ${schemas.ops}.riders r ON r.id = t.rider_id
    LEFT JOIN ${schemas.ops}.rider_vehicle_assignments a
           ON a.rider_id = r.id AND a.status = 'active'
    LEFT JOIN ${schemas.ops}.vehicles v ON v.id = a.vehicle_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'id', x.id, 'author', x.author, 'author_name', x.author_name,
               'body', x.body, 'media_url', x.media_url, 'media_type', x.media_type,
               'kind', x.kind,
               'created_at', to_char(x.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS')
             ) ORDER BY x.created_at) AS messages
        FROM ${schemas.ops}.rider_ticket_messages x WHERE x.ticket_id = t.id
    ) m ON true
    WHERE (t.status <> 'resolved' OR t.resolved_at > now() - interval '7 days')
      ${hubScopeSql(scope, "t.hub_id")}
    ORDER BY (t.status <> 'resolved') DESC,
             CASE WHEN t.status <> 'resolved' THEN t.created_at END ASC,
             t.resolved_at DESC`);

  // "Open" for the sidebar badge means "still needs someone" — a ticket waiting
  // on the rider's yes/no is not off ops' plate either.
  const open = res.rows.filter((t: { status: string }) => t.status !== "resolved").length;
  return NextResponse.json({ tickets: res.rows, open });
}
