// Keep the split ops actually typed at handover.
//
// "Of which, rent" exists because INFERRING that number invented ₹8,817 of
// payments nobody made. Ops state it, the allotment uses it to work out how
// many days the rider bought — and then throws it away. It is on no column and
// in no audit entry, so the one figure that decides a rider's coverage cannot
// be checked afterwards.
//
// Backfilled from the handover payment row, which IS the rent that was
// recorded. For allotments made before the field existed that value is the
// legacy guess (a full week, right or wrong), which is exactly what we want on
// the record: it says what the system believed, and the write-off register
// already says where that was wrong.
// The same hole exists for the other two parts of the cash. amount_collected
// is ONE number — Gaurav handed over ₹3,820 and nothing records that it was
// ₹1,500 fee + ₹500 deposit + ₹1,820 rent. Those figures live on the RIDER as
// the agreed amounts, not as what was taken that day, so reconciling a handover
// against its parts means adding up numbers that happen to fit. Storing all
// three makes amount_collected checkable instead of inferred.
//
// Only rent_collected is backfilled. There is no source for the historical
// fee/deposit split, and inventing one would be exactly the guessing this
// column exists to stop — old rows stay NULL, which says "unknown" honestly.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    ALTER TABLE ${S}.rider_vehicle_assignments
      ADD COLUMN IF NOT EXISTS rent_collected    numeric(10,2),
      ADD COLUMN IF NOT EXISTS fee_collected     numeric(10,2),
      ADD COLUMN IF NOT EXISTS deposit_collected numeric(10,2)`);

  await client.query(`
    UPDATE ${S}.rider_vehicle_assignments a
       SET rent_collected = p.amount_collected
      FROM ${S}.rider_payments p
     WHERE p.rider_id = a.rider_id
       AND p.payment_date = a.assigned_date
       AND p.payment_mode IS NULL
       AND a.rent_collected IS NULL`);
};
