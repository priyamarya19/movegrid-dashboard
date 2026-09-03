/**
 * When rent starts, given when the scooter went out.
 *
 * The 2 PM rule, agreed with ops: a rider who collects in the morning has the
 * day to earn in, so that day is chargeable. A rider who collects late does
 * not, so the day is free and charging starts tomorrow.
 *
 * Shared by the allotment form and the allotment route on purpose — if the two
 * computed it separately, every override would need approving because the
 * screen and the server disagreed about the default.
 */

/** IST is UTC+5:30, with no daylight saving to worry about. */
const IST_OFFSET_MIN = 330;

/**
 * The cut-off, in IST hours. Collect before it and the day is chargeable;
 * collect after and it is free.
 *
 * Moved from 15 to 14 on 3 Sep 2026. Gaurav and Rohit were handed scooters at
 * 14:04 and 14:50 and charged for that day, which ops did not consider a full
 * day's earning — the boundary is where a rider can still make the day pay,
 * and 2 PM is where that actually sits.
 */
export const RENT_START_CUTOFF_HOUR: number = require("./rentStartCutoff").RENT_START_CUTOFF_HOUR;

/** The wall-clock date and hour in IST for an instant. */
export function istParts(at: Date): { date: string; hour: number; minute: number } {
  const shifted = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The default first chargeable day.
 *
 * `handoverDate` is the day the scooter went out (ops can allot for an earlier
 * date); `at` is the moment of handover, used only for the cut-off. When the
 * allotment is being recorded for an earlier day the clock tells us nothing
 * about when that rider actually collected, so the free day is given —
 * the older, more generous rule — rather than guessing from today's time.
 */
export function defaultRentStart(handoverDate: string, at: Date = new Date()): string {
  const now = istParts(at);
  if (now.date !== handoverDate) return addDays(handoverDate, 1);
  return now.hour < RENT_START_CUTOFF_HOUR ? handoverDate : addDays(handoverDate, 1);
}

/** Plain-language reason, shown next to the date so ops know why it is that day. */
export function rentStartReason(handoverDate: string, at: Date = new Date()): string {
  const now = istParts(at);
  if (now.date !== handoverDate) return "back-dated allotment, so the handover day is free";
  return now.hour < RENT_START_CUTOFF_HOUR
    ? "handed over before 2 PM, so today is chargeable"
    : "handed over after 2 PM, so today is free";
}
