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

/** Date in en-IN, e.g. 12 Jul 2026. Accepts an ISO string or Date. */
export function dateIN(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", opts ?? { day: "numeric", month: "short", year: "numeric" });
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
