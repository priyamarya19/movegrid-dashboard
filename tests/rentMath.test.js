// Unit tests for the pure rent arithmetic (lib/rentMath.js), which the rent
// ledger (scripts/phase1-rent-ledger.js) uses. Run with `npm test` (node --test).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { addDaysISO, daysBetween, generateWeeks, owedNow, amountDueForDaysBehind } = require("../lib/rentMath");

test("addDaysISO crosses month boundaries in UTC", () => {
  assert.equal(addDaysISO("2026-06-30", 1), "2026-07-01");
  assert.equal(addDaysISO("2026-07-01", -1), "2026-06-30");
  assert.equal(addDaysISO("2026-02-28", 1), "2026-03-01"); // 2026 not a leap year
});

test("daysBetween is a whole-day difference", () => {
  assert.equal(daysBetween("2026-07-08", "2026-07-11"), 3);
  assert.equal(daysBetween("2026-07-11", "2026-07-08"), -3);
});

test("generateWeeks: a fresh assignment bills weekly from the assigned date", () => {
  // Active rider: cutoff is exclusive (tomorrow), so a week counts if it STARTS before it.
  const { weeks } = generateWeeks({ startISO: "2026-06-11", cutoffISO: "2026-07-16" });
  assert.equal(weeks.length, 5);
  // Week 1 is due on the allotment day itself — a tenancy has no "day before".
  assert.deepEqual(weeks[0], { weekNo: 1, periodStart: "2026-06-11", periodEnd: "2026-06-17", dueDate: "2026-06-11" });
  assert.deepEqual(weeks[4], { weekNo: 5, periodStart: "2026-07-09", periodEnd: "2026-07-15", dueDate: "2026-07-08" });
});

test("generateWeeks: returned assignment stops at the return date (exclusive)", () => {
  // Md Barik's first vehicle: assigned 11 Jun, returned 30 Jun.
  const { weeks, lastWeekNo, lastPeriodEnd } = generateWeeks({ startISO: "2026-06-11", cutoffISO: "2026-06-30" });
  assert.equal(weeks.length, 3);
  assert.equal(weeks[2].periodStart, "2026-06-25");
  assert.equal(weeks[2].periodEnd, "2026-07-01");
  assert.equal(lastWeekNo, 3);
  assert.equal(lastPeriodEnd, "2026-07-01");
});

test("generateWeeks: an issue-swap continuation keeps week numbers AND cadence unbroken", () => {
  // The exact regression: after the first vehicle ends 1 Jul as Week 3, the new
  // vehicle's Week 4 must run 2 Jul - 8 Jul, NOT restart at Week 1 on its own date.
  const first = generateWeeks({ startISO: "2026-06-11", cutoffISO: "2026-06-30" });
  const cont = generateWeeks({
    startISO: addDaysISO(first.lastPeriodEnd, 1),   // day after 1 Jul = 2 Jul
    cutoffISO: "2026-07-16",
    startWeekNo: first.lastWeekNo + 1,              // Week 4
  });
  assert.deepEqual(cont.weeks[0], { weekNo: 4, periodStart: "2026-07-02", periodEnd: "2026-07-08", dueDate: "2026-07-01" });
  assert.deepEqual(cont.weeks[1], { weekNo: 5, periodStart: "2026-07-09", periodEnd: "2026-07-15", dueDate: "2026-07-08" });
});

test("generateWeeks: same-day return produces no billable week", () => {
  const { weeks } = generateWeeks({ startISO: "2026-07-10", cutoffISO: "2026-07-10" });
  assert.equal(weeks.length, 0);
});

test("owedNow: live balance grows per day past paid-through", () => {
  // Paid through 8 Jul, today 11 Jul, ₹260/day → ₹780 (the real chase-list case).
  assert.equal(owedNow("2026-07-08", "2026-07-11", 260), 780);
  // Paid through today or later → nothing owed.
  assert.equal(owedNow("2026-07-16", "2026-07-11", 260), 0);
});

test("amountDueForDaysBehind: rounds up to whole weeks", () => {
  assert.equal(amountDueForDaysBehind(3, 260), 1820);  // part-week → 1 week = 260*7
  assert.equal(amountDueForDaysBehind(7, 260), 1820);  // exactly 1 week
  assert.equal(amountDueForDaysBehind(8, 260), 3640);  // into week 2 → 2 weeks
  assert.equal(amountDueForDaysBehind(0, 260), 0);     // not behind → nothing
  assert.equal(amountDueForDaysBehind(-2, 260), 0);
});
