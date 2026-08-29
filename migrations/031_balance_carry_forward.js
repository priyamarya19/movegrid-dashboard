// Carry-forward, with a shelf life.
//
// Migration 027 gave riders a balance: prepaid days that survive the assignment
// they were bought on. What it did not have was any of the human judgement
// around it, which is what ops actually asked for:
//
//  * The day count is a JUDGEMENT, not a subtraction. Week paid 1–7, scooter
//    back on the 5th — is that 2 days left or 3? It depends on whether the
//    rider had the use of the 5th, and only the person taking the scooter back
//    knows. So ops choose, within a ceiling they cannot exceed.
//
//  * The balance is not indefinite. A rider who comes back inside 15 days
//    spends it; after that it lapses. Lapsing has to be RECORDED — the money
//    was collected, so it cannot just quietly stop existing.
//
// The rupee value stays authoritative (rates change between allotments); the
// day count rides alongside it because that is what ops and riders talk about.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    ALTER TABLE ${S}.riders
      -- Days behind the balance, as agreed at return. Display and conversation.
      ADD COLUMN IF NOT EXISTS balance_days   int  NOT NULL DEFAULT 0,
      -- Last day the balance can be spent. NULL = no balance to spend.
      ADD COLUMN IF NOT EXISTS balance_expires_on date`);

  await client.query(`
    ALTER TABLE ${S}.rider_balance_entries
      -- Days this movement was worth, so the history reads the way ops think.
      ADD COLUMN IF NOT EXISTS days int,
      -- 'carry_forward' | 'spent' | 'expired' | 'manual'
      ADD COLUMN IF NOT EXISTS kind text`);

  // Label the entries written before this column existed, so reporting on
  // 'expired' doesn't silently mean "everything since Friday".
  await client.query(`
    UPDATE ${S}.rider_balance_entries
       SET kind = CASE WHEN delta > 0 THEN 'carry_forward' ELSE 'spent' END
     WHERE kind IS NULL`);

  await client.query(`
    ALTER TABLE ${S}.rider_vehicle_assignments
      -- What ops chose at handback, and what the arithmetic allowed. Both, so a
      -- later question about a specific return can be answered without guessing.
      ADD COLUMN IF NOT EXISTS carry_forward_days     int,
      ADD COLUMN IF NOT EXISTS carry_forward_max_days int`);

  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_riders_balance_expiry ON ${S}.riders (balance_expires_on)
       WHERE balance > 0`
  );
};

module.exports.CARRY_FORWARD_WINDOW_DAYS = 15;
