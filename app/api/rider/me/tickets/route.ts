import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRider } from "@/lib/riderAuth";

// Rider support tickets.
//
// GET  — this rider's own tickets, newest first, with the ops resolution note.
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
    `SELECT id, message, media_url, media_type, status, resolution_note,
            to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
            to_char(resolved_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS resolved_at
     FROM ${schemas.ops}.rider_tickets
     WHERE rider_id = $1
     ORDER BY created_at DESC
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

  // One open ticket at a time — stops a frustrated rider filing the same
  // complaint five times and burying the queue.
  const open = await pool.query(
    `SELECT id FROM ${schemas.ops}.rider_tickets WHERE rider_id = $1 AND status = 'open' LIMIT 1`,
    [riderId]
  );
  if ((open.rowCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Your previous request is still open", code: "already_open", ticket_id: open.rows[0].id },
      { status: 409 }
    );
  }

  // Denormalise the hub so the ops queue can be hub-scoped like every other list.
  const res = await pool.query(
    `INSERT INTO ${schemas.ops}.rider_tickets (rider_id, hub_id, message, media_url, media_type)
     VALUES ($1, (SELECT assigned_hub_id FROM ${schemas.ops}.riders WHERE id = $1), $2, $3, $4)
     RETURNING id, status,
       to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at`,
    [riderId, message, mediaUrl, mediaType]
  );
  return NextResponse.json(res.rows[0], { status: 201 });
}
