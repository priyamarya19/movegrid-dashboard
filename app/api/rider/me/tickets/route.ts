import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// Rider support tickets.
//
// GET  — this rider's own tickets, newest first, each with its full thread.
// POST — raise one: a message plus an optional photo or short video.
//
// Only riders who hold a vehicle now, or have held one before, may raise a
// ticket: support is about a scooter, and it keeps the queue clear of noise
// from the ~140 lead-created rider records that never took delivery.

async function hasOrHadAVehicle(riderId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM ${schemas.ops}.rider_vehicle_assignments WHERE rider_id = $1 LIMIT 1`,
    [riderId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function GET(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;

  const res = await pool.query(
    `SELECT t.id, t.message, t.media_url, t.media_type, t.status, t.resolution_note,
            to_char(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
            to_char(t.resolved_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS resolved_at,
            COALESCE(m.messages, '[]'::json) AS messages
     FROM ${schemas.ops}.rider_tickets t
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
                'id', x.id, 'author', x.author, 'author_name', x.author_name,
                'body', x.body, 'media_url', x.media_url, 'media_type', x.media_type,
                'kind', x.kind,
                'created_at', to_char(x.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS')
              ) ORDER BY x.created_at) AS messages
         FROM ${schemas.ops}.rider_ticket_messages x WHERE x.ticket_id = t.id
     ) m ON true
     WHERE t.rider_id = $1
     ORDER BY t.created_at DESC
     LIMIT 50`,
    [guard.rider.riderId]
  );
  return NextResponse.json({ tickets: res.rows });
}

export async function POST(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;
  const riderId = guard.rider.riderId;

  if (!(await hasOrHadAVehicle(riderId))) {
    return NextResponse.json(
      { error: "Support is available once you have a scooter", code: "no_assignment" },
      { status: 403 }
    );
  }

  const b = await req.json().catch(() => ({}));
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (message.length < 3) {
    return NextResponse.json({ error: "Please describe the problem", code: "message_required" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message is too long", code: "message_too_long" }, { status: 400 });
  }

  const mediaUrl = typeof b.media_url === "string" && b.media_url ? b.media_url : null;
  const mediaType = b.media_type === "image" || b.media_type === "video" ? b.media_type : null;
  if ((mediaUrl && !mediaType) || (mediaType && !mediaUrl)) {
    return NextResponse.json({ error: "Attachment is incomplete", code: "bad_media" }, { status: 400 });
  }

  // Denormalise the hub so the ops queue can be hub-scoped like every other list.
  //
  // The opening message is written twice on purpose: rider_tickets.message
  // stays the ticket's subject line for every list and report that reads it,
  // and the same text starts the thread so the conversation reads in order.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `INSERT INTO ${schemas.ops}.rider_tickets (rider_id, hub_id, message, media_url, media_type)
       VALUES ($1, (SELECT assigned_hub_id FROM ${schemas.ops}.riders WHERE id = $1), $2, $3, $4)
       RETURNING id, status,
         to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at`,
      [riderId, message, mediaUrl, mediaType]
    );
    await client.query(
      `INSERT INTO ${schemas.ops}.rider_ticket_messages (ticket_id, author, body, media_url, media_type)
       VALUES ($1, 'rider', $2, $3, $4)`,
      [res.rows[0].id, message, mediaUrl, mediaType]
    );
    await client.query("COMMIT");
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
