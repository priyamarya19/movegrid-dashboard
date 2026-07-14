// Shared display formatters. Financial amounts must use en-IN grouping (lakh/
// crore) regardless of the viewer's browser locale — a bare toLocaleString()
// renders differently on an en-US machine, so always go through inr().

/** Full rupee amount with Indian grouping, e.g. ₹1,82,000. */
export function inr(n: number | string | null | undefined): string {
  return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
}

/** Compact rupee amount for tight stat tiles: ₹1.8L / ₹84K / ₹420. */
export function inrCompact(n: number): string {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(0) + "K";
  return "₹" + Math.round(n);
}

// All display times are rendered in IST — the business timezone — regardless of
// where the render happens (the UTC server during SSR, or the viewer's browser).
// Backend/storage stays UTC; only the *display* is pinned here.
const IST = "Asia/Kolkata";

/** Date in IST, e.g. 12 Jul 2026. Accepts an ISO string or Date. */
export function dateIN(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { timeZone: IST, ...(opts ?? { day: "numeric", month: "short", year: "numeric" }) });
}

/** Date + time in IST, e.g. 12 Jul 2026, 8:27 pm. */
export function dateTimeIN(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

/** Time-of-day in IST, e.g. 8:27 pm. */
export function timeIN(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
}

/** Relative time, e.g. 5m ago / 3h ago / 2d ago. */
export function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Time-of-day greeting in IST (the business timezone). */
export function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
