// Pure rent arithmetic — no DB, no I/O — so it can be unit-tested in isolation.
// This is the logic that has actually regressed twice (week continuity across an
// issue-swap), so it lives here, is covered by tests/rentMath.test.js, and is
// used by scripts/phase1-rent-ledger.js so the tests guard the real ledger.
//
// CommonJS (module.exports) so the CJS ledger script can require it and the node
// test runner can import it. All dates are 'YYYY-MM-DD' strings, treated as UTC
// midnight to avoid timezone drift.

/** Add n days to a 'YYYY-MM-DD' string, returning a 'YYYY-MM-DD' string. */
function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days between two 'YYYY-MM-DD' strings (b - a). */
function daysBetween(aISO, bISO) {
  return Math.round(
    (new Date(bISO + "T00:00:00Z").getTime() - new Date(aISO + "T00:00:00Z").getTime()) / 86400000
  );
}

/**
 * Generate the unbroken weekly billing periods for one assignment.
 *
 * @param {object} p
 * @param {string} p.startISO      first day of the first period (for a continuation
 *                                 this is the day AFTER the linked assignment's last
 *                                 period end, so the cadence never breaks).
 * @param {string} p.cutoffISO     exclusive: a period is billable only if it STARTS
 *                                 before this (return day, or tomorrow if active).
 * @param {number} [p.startWeekNo] week number of the first period (continuations
 *                                 pick up where the linked assignment left off).
 * @returns {{weeks: Array<{weekNo:number,periodStart:string,periodEnd:string,dueDate:string}>,
 *           lastWeekNo:number, lastPeriodEnd:string}}
 */
function generateWeeks({ startISO, cutoffISO, startWeekNo = 1 }) {
  const weeks = [];
  let weekNo = startWeekNo;
  let ps = startISO;
  let lastPeriodEnd = addDaysISO(startISO, -1); // nothing generated yet
  while (daysBetween(ps, cutoffISO) > 0) {
    const pe = addDaysISO(ps, 6);
    weeks.push({
      weekNo,
      periodStart: ps,
      periodEnd: pe,
      dueDate: addDaysISO(ps, -1), // rent in advance: due the day before the cycle
    });
    lastPeriodEnd = pe;
    ps = addDaysISO(ps, 7);
    weekNo += 1;
  }
  return { weeks, lastWeekNo: weekNo - 1, lastPeriodEnd };
}

/**
 * Live outstanding balance from a paid-through date (rolling-balance model).
 * Mirror of the scripts' owed calc: max(0, today - paidThrough) * dailyRent.
 */
function owedNow(paidThroughISO, todayISO, dailyRent) {
  return Math.max(0, daysBetween(paidThroughISO, todayISO)) * Number(dailyRent);
}

/**
 * Amount due rounded up to whole weeks — mirror of the CEIL(days/7)*rate*7 SQL in
 * lib/rent.ts / app/api/riders. daysBehind <= 0 means nothing owed.
 */
function amountDueForDaysBehind(daysBehind, dailyRent) {
  if (daysBehind <= 0) return 0;
  const weeks = Math.ceil(daysBehind / 7);
  return weeks * Number(dailyRent) * 7;
}

module.exports = { addDaysISO, daysBetween, generateWeeks, owedNow, amountDueForDaysBehind };
