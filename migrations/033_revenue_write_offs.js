// Revenue we decided not to collect.
//
// Distinct from bad_debts, which is money a rider owed and did not pay. This is
// the other thing: rent that was never properly billed because WE got something
// wrong, and that Priyam has decided to absorb rather than chase.
//
// Sonu Yadav is the first entry. A continuation on 17 July took ₹1 in cash —
// ops typed it because the form rejected ₹0 — and the old allotment code read
// any positive amount as "week one paid" and recorded ₹1,820. He got seven days
// he never bought. He has since paid ₹1,820 every Thursday without missing one,
// so chasing him for our own bug is not worth the relationship.
//
// It is recorded rather than quietly dropped for two reasons: the books
// otherwise show more rent earned than cash collected with nothing explaining
// the gap, and the CA will eventually ask.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${S}.revenue_write_offs (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      rider_id      uuid REFERENCES ${S}.riders(id) ON DELETE SET NULL,
      assignment_id uuid REFERENCES ${S}.rider_vehicle_assignments(id) ON DELETE SET NULL,
      amount        numeric(10,2) NOT NULL CHECK (amount > 0),
      -- Days of rent behind the amount, where it is a rent case. Ops and riders
      -- talk in days, and it makes the entry legible without arithmetic.
      days          int,
      -- Why we are absorbing it, in words. Not an enum: every one of these is a
      -- specific decision and the reasoning is the point of the record.
      reason        text NOT NULL,
      -- Who decided. These are judgement calls, not process.
      decided_by    text NOT NULL,
      occurred_on   date,
      created_at    timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS revenue_write_offs_rider_idx ON ${S}.revenue_write_offs (rider_id, created_at DESC)`
  );
};
