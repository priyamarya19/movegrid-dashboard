// Support tickets become a conversation.
//
// What was there: one `message` from the rider, one `resolution_note` from ops
// that every later reply overwrote, and a rider who could not answer at all.
// Replying also flipped the ticket straight to resolved — which is what Priyam
// hit: "I sent one reply and it was marked resolved. why?"
//
// What it becomes: every message is a row, and closing is agreed rather than
// declared. Ops ask to close, the rider says yes, and only then is it resolved.
// A rider who says nothing for a week closes it by default — otherwise the
// queue fills with tickets nobody can ever clear.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.rider_ticket_messages (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id   uuid NOT NULL REFERENCES ${S}.rider_tickets(id) ON DELETE CASCADE,
      -- Who is speaking. 'system' covers the auto-close, which is nobody.
      author      text NOT NULL CHECK (author IN ('rider','ops','system')),
      author_name text,
      body        text,
      media_url   text,
      media_type  text CHECK (media_type IN ('image','video')),
      -- Ordinary talk, or one of the moves that changes the ticket's state.
      kind        text NOT NULL DEFAULT 'message'
                  CHECK (kind IN ('message','close_request','close_approved','close_declined','auto_closed')),
      created_at  timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS rider_ticket_messages_ticket_idx
       ON ${S}.rider_ticket_messages (ticket_id, created_at)`
  );

  // 'pending_closure': ops have asked, the rider has not answered yet. A real
  // state, not a flag, because the queue needs to show it and the auto-close
  // needs to find it.
  await client.query(`ALTER TABLE ${S}.rider_tickets DROP CONSTRAINT IF EXISTS rider_tickets_status_check`);
  await client.query(`
    ALTER TABLE ${S}.rider_tickets
      ADD CONSTRAINT rider_tickets_status_check
      CHECK (status IN ('open','pending_closure','resolved'))`);
  await client.query(`
    ALTER TABLE ${S}.rider_tickets
      ADD COLUMN IF NOT EXISTS close_requested_at timestamptz,
      ADD COLUMN IF NOT EXISTS close_requested_by text`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS rider_tickets_pending_closure_idx
       ON ${S}.rider_tickets (close_requested_at) WHERE status = 'pending_closure'`
  );

  // Move the existing one-message-each-way tickets into the thread, so the new
  // screens have something to show and history is not split across two shapes.
  await client.query(`
    INSERT INTO ${S}.rider_ticket_messages (ticket_id, author, body, media_url, media_type, created_at)
    SELECT t.id, 'rider', t.message, t.media_url, t.media_type, t.created_at
      FROM ${S}.rider_tickets t
     WHERE NOT EXISTS (SELECT 1 FROM ${S}.rider_ticket_messages m WHERE m.ticket_id = t.id)`);
  await client.query(`
    INSERT INTO ${S}.rider_ticket_messages (ticket_id, author, author_name, body, created_at)
    SELECT t.id, 'ops', t.resolved_by,
           t.resolution_note,
           -- resolved_at is NULL on a ticket that was replied to but left open;
           -- the reply still came after the question, so nudge it past created_at.
           COALESCE(t.resolved_at, t.created_at + interval '1 second')
      FROM ${S}.rider_tickets t
     WHERE COALESCE(TRIM(t.resolution_note), '') <> ''
       AND NOT EXISTS (
         SELECT 1 FROM ${S}.rider_ticket_messages m
          WHERE m.ticket_id = t.id AND m.author = 'ops')`);
};
