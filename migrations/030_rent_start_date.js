// Rent start date, separated from the day the scooter physically went out.
//
// Until now the two were the same thing: rent ran from the day AFTER
// assigned_date, always. That blanket free day is generous on a rider who
// collects at 9 in the morning and gets a full day's earning out of it, and
// mean on nobody — so ops asked for the 3 PM cut-off instead:
//
//   handed over BEFORE 3 PM IST  ->  rent starts the same day
//   handed over AT/AFTER 3 PM    ->  rent starts the next day
//
// Ops can still type a different date — riders turn up late, a scooter goes out
// on trial, things happen — but that is a money decision, so it needs an
// admin's code (action 'allotment_start_date').
//
// Nothing here changes what anyone already owes. paid_through_date is stored
// per assignment and is left exactly as it is; the backfill only writes down,
// after the fact, the start date the old rule implied.
module.exports.up = async ({ client, S }) => {
  const T = `${S}.rider_vehicle_assignments`;

  await client.query(`
    ALTER TABLE ${T}
      -- When the rider actually took the scooter. The 3 PM rule reads this, so
      -- it has to be a timestamp, not a date.
      ADD COLUMN IF NOT EXISTS handed_over_at         timestamptz,
      -- First chargeable day.
      ADD COLUMN IF NOT EXISTS rent_start_date        date,
      -- Set when ops chose a date the clock did not justify, with the admin who
      -- allowed it — so a query can find every one of them later.
      ADD COLUMN IF NOT EXISTS rent_start_overridden  boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS rent_start_approved_by text
  `);

  // Priyam asked for the older allotments to carry a timestamp too, so the rule
  // has something to read historically. created_at is when the allotment was
  // entered, which for field entries is within minutes of the handover.
  await client.query(`UPDATE ${T} SET handed_over_at = created_at WHERE handed_over_at IS NULL`);

  // The old rule, written down: the handover day was free, so charging began
  // the next day. Recorded for the history, not applied to it.
  await client.query(`
    UPDATE ${T} SET rent_start_date = assigned_date + 1 WHERE rent_start_date IS NULL
  `);

  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_rva_rent_start_overridden ON ${T} (rent_start_overridden)
       WHERE rent_start_overridden`
  );

  // A code per approver, rather than one code sent to all of them.
  //
  // With a shared code there is no way to know which admin actually read it
  // out — the record says "approved" and names nobody, which is no use when
  // someone asks six weeks later why a rider started free. Giving each approver
  // their own code makes the code itself the signature.
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.approval_request_codes (
      request_id  uuid NOT NULL REFERENCES ${S}.approval_requests(id) ON DELETE CASCADE,
      user_id     uuid NOT NULL,
      user_name   text,
      user_email  text,
      code_hash   text NOT NULL,
      PRIMARY KEY (request_id, user_id)
    )`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_approval_codes_request ON ${S}.approval_request_codes (request_id)`
  );
};
