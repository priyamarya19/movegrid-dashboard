// Rider app v2: the backend for the rebuilt rider flow.
//
//   login → city → "KYC pending" home (hub address + map + tap-to-call ops)
//         → scooter catalog → raise a ticket
//
// Four independent pieces:
//  1. hubs gains the contact/location fields the "visit the hub" screen needs.
//     They stay NULL until Priyam fills them in on the Hubs form; the app hides
//     the map button while map_link is empty rather than opening a dead link.
//  2. riders.preferred_oem — which BRAND the rider says they want. Deliberately
//     NOT riders.vehicle_pref: that column already means speed class and drives
//     the high-speed KYC document gate (see /api/rider/me).
//  3. rider_tickets — rider questions/complaints, one message + optional photo
//     or short video, worked off in the dashboard and the ops app.
//  4. rider_push_tokens — Expo push targets, one row per device.
module.exports.up = async ({ client, S }) => {
  // ── 1. Hub location + the ops person a rider can actually call ────────────
  await client.query(`
    ALTER TABLE ${S}.hubs
      ADD COLUMN IF NOT EXISTS address        text,
      ADD COLUMN IF NOT EXISTS map_link       text,
      ADD COLUMN IF NOT EXISTS contact_name   text,
      ADD COLUMN IF NOT EXISTS contact_mobile text`);

  // Seed the one hub that exists so the call button works from day one.
  // COALESCE, so re-running never overwrites a value edited in the UI.
  await client.query(`
    UPDATE ${S}.hubs
       SET contact_name   = COALESCE(contact_name, 'Ajay Mathur'),
           contact_mobile = COALESCE(contact_mobile, '9354706352')
     WHERE hub_id = 'HUB-122'`);

  // ── 2. Which brand the rider asked for, from the scooter catalog ──────────
  await client.query(`
    ALTER TABLE ${S}.riders
      ADD COLUMN IF NOT EXISTS preferred_oem    text,
      ADD COLUMN IF NOT EXISTS preferred_oem_at timestamptz`);

  // ── 3. Catalog artwork. A URL, not a bundled asset, so real photos can be
  //       added without shipping an app build.
  await client.query(`
    ALTER TABLE ${S}.vehicle_models
      ADD COLUMN IF NOT EXISTS image_url text`);

  // ── 4. Rider tickets ──────────────────────────────────────────────────────
  // hub_id is denormalised at creation from the rider's assigned hub so the
  // queue can be hub-scoped like every other ops list (lib/hubScope.ts). NULL
  // hub rows stay visible there by design — same rule as riders/vehicles.
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.rider_tickets (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id        uuid NOT NULL REFERENCES ${S}.riders(id) ON DELETE CASCADE,
      hub_id          uuid REFERENCES ${S}.hubs(id) ON DELETE SET NULL,
      message         text NOT NULL,
      media_url       text,
      media_type      text CHECK (media_type IN ('image','video')),
      status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      resolution_note text,
      resolved_by     text,
      resolved_at     timestamptz,
      created_at      timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS rider_tickets_status_idx ON ${S}.rider_tickets (status, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS rider_tickets_rider_idx  ON ${S}.rider_tickets (rider_id, created_at DESC)`);

  // ── 5. Push tokens ────────────────────────────────────────────────────────
  // UNIQUE on token, not on (rider, token): a shared or resold handset must
  // move to the new rider on registration, never notify both.
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.rider_push_tokens (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id     uuid NOT NULL REFERENCES ${S}.riders(id) ON DELETE CASCADE,
      token        text NOT NULL UNIQUE,
      platform     text,
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      created_at   timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS rider_push_tokens_rider_idx ON ${S}.rider_push_tokens (rider_id)`);
};
