// Where the scooter went.
//
// Points come from the rider's phone in batches, so this table has to tolerate
// duplicates, out-of-order arrival and long offline gaps — a rider in a
// basement or out of credit uploads an hour of history at once when they
// resurface.
//
// VOLUME. A point every 30 seconds across 40 riders for a 10-hour day is about
// 48,000 rows a day, 1.5 million a month. Two things keep that in hand:
//
//   * the phone only records when it has MOVED 50m, so a parked scooter costs
//     nothing — most of the theoretical volume never happens
//   * RETENTION_DAYS below. Nothing keeps a year of breadcrumbs by accident.
//
// PRIVACY. This tracks people, not just vehicles. Recording only runs while the
// rider holds a scooter — assignment_id is NOT NULL for exactly that reason, so
// a point with no live tenancy cannot be written. What happens to the data, who
// may look at it, and what riders are told belongs in the rental agreement, and
// that conversation has to happen before this is switched on for anyone.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.rider_locations (
      id             bigserial PRIMARY KEY,
      rider_id       uuid NOT NULL REFERENCES ${S}.riders(id) ON DELETE CASCADE,
      -- The tenancy this point belongs to. Never null: no scooter, no tracking.
      assignment_id  uuid NOT NULL REFERENCES ${S}.rider_vehicle_assignments(id) ON DELETE CASCADE,
      lat            double precision NOT NULL CHECK (lat  BETWEEN -90  AND 90),
      lng            double precision NOT NULL CHECK (lng  BETWEEN -180 AND 180),
      -- Metres. A 2km fix is not evidence of anything, so keep it and let the
      -- reader decide rather than silently trusting every point equally.
      accuracy_m     real,
      speed_mps      real,
      heading_deg    real,
      battery_pct    smallint,
      -- When the phone recorded it, which is NOT when we received it.
      recorded_at    timestamptz NOT NULL,
      received_at    timestamptz NOT NULL DEFAULT now(),
      -- The phone's own id for this point. Retried uploads carry the same one,
      -- so a dropped connection cannot double-write an hour of history.
      client_id      uuid NOT NULL
    )`);

  // One row per client_id: the whole idempotency story in one constraint.
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS rider_locations_client_idx ON ${S}.rider_locations (client_id)`
  );
  // The query everything asks: this rider, most recent first.
  await client.query(
    `CREATE INDEX IF NOT EXISTS rider_locations_rider_time_idx
       ON ${S}.rider_locations (rider_id, recorded_at DESC)`
  );
  // And the retention sweep's query.
  await client.query(
    `CREATE INDEX IF NOT EXISTS rider_locations_recorded_idx ON ${S}.rider_locations (recorded_at)`
  );
};

// How long breadcrumbs are kept. Long enough to investigate a theft or a
// disputed trip, short enough that we are not sitting on a year of somebody's
// movements. Revisit alongside the rental agreement.
module.exports.RETENTION_DAYS = 90;
