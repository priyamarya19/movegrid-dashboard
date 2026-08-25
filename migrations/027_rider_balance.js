// Rider balance — prepaid days that outlive the assignment they were paid on.
//
// The rolling-rent model holds everything on the ACTIVE assignment:
// paid_through_date and rent_credit both live there. So a rider who paid for a
// full week and handed the scooter back on day 3 simply lost the other four
// days — the row closed and the money went with it. That is what happened to
// Rajendra Prasad, and it is why his next allotment looked overdue when it
// wasn't.
//
// riders.balance is the durable place for that value: rupees the rider has
// already paid and not yet consumed. It is credited when an assignment closes
// with days left on it, and spent automatically on the next allotment.
//
// Policy, decided 20 Aug 2026: this is never refunded in cash. A started week
// is still charged as a full week — only days already PAID FOR are carried.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    ALTER TABLE ${S}.riders
      ADD COLUMN IF NOT EXISTS balance numeric(10,2) NOT NULL DEFAULT 0`);

  // Every movement, so the number on the riders page can always be explained.
  // The column is the running total; this table is the history behind it.
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.rider_balance_entries (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id       uuid NOT NULL REFERENCES ${S}.riders(id) ON DELETE CASCADE,
      -- Positive credits the rider, negative spends it. Both are recorded.
      delta          numeric(10,2) NOT NULL,
      balance_after  numeric(10,2) NOT NULL,
      reason         text NOT NULL,
      assignment_id  uuid REFERENCES ${S}.rider_vehicle_assignments(id) ON DELETE SET NULL,
      created_by     text,
      created_at     timestamptz NOT NULL DEFAULT now()
    )`);

  await client.query(
    `CREATE INDEX IF NOT EXISTS rider_balance_entries_rider_idx
       ON ${S}.rider_balance_entries (rider_id, created_at DESC)`
  );

  // No backfill. Past returns were settled under the old rule and their money
  // is already reflected in bad debt or in what was collected; inventing
  // balances for them now would double-count. Rajendra Prasad's case is
  // corrected by hand, separately and deliberately.
};
