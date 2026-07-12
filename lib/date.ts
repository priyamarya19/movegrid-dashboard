// Today's date in IST as YYYY-MM-DD.
//
// The bug this replaces: `new Date().toISOString().split("T")[0]` returns the UTC
// date, so between 00:00 and 05:30 IST it yields *yesterday* — silently recording
// an allotment or return on the wrong day, which shifts the whole per-day rent
// ledger. en-CA formats as YYYY-MM-DD; the timeZone option does the IST shift.
export function istTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
