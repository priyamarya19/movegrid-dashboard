// Does the payment row already reflect the write-off, or not?
//
// Two different treatments, forced on us by the GST calendar:
//
//   * August onwards — the period is open, so the payment row is corrected to
//     the cash actually taken. The row and reality agree.
//   * May, June, July — filed. Those rows were part of what was submitted and
//     cannot move, so they still say ₹1,680 where ₹800 crossed the counter.
//
// Without knowing which is which, any screen trying to show "what was actually
// received" would subtract the write-off from an already-corrected row and
// report ₹800 − ₹880 = −₹80. This flag is how the display tells them apart.
module.exports.up = async ({ client, S }) => {
  await client.query(`
    ALTER TABLE ${S}.revenue_write_offs
      ADD COLUMN IF NOT EXISTS payment_row_corrected boolean NOT NULL DEFAULT false`);
};
