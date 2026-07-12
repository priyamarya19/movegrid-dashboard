// Minimal in-process rate limiter for auth endpoints.
//
// Not distributed (each pm2 process has its own map), but the dashboard runs as a
// single process per env, and the goal here is only to blunt credential stuffing /
// reset-link spraying — not to be a hardened WAF. Sliding window per key: after
// `max` failures inside `windowMs`, further attempts are refused until the window
// clears. Call succeed() on a good login to reset the key.
type Entry = { count: number; first: number };
const buckets = new Map<string, Entry>();

// Occasional sweep so the map can't grow unbounded from unique keys.
let lastSweep = 0;
function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [k, e] of buckets) if (now - e.first > windowMs) buckets.delete(k);
}

export function rateLimit(
  key: string,
  { max = 8, windowMs = 10 * 60 * 1000 }: { max?: number; windowMs?: number } = {}
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now, windowMs);
  const e = buckets.get(key);
  if (!e || now - e.first > windowMs) {
    buckets.set(key, { count: 1, first: now });
    return { ok: true, retryAfterSec: 0 };
  }
  e.count += 1;
  if (e.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - e.first)) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

// Clear a key after a successful auth so a legitimate user isn't penalised for a
// few earlier typos.
export function rateLimitReset(key: string) {
  buckets.delete(key);
}

// Best-effort client IP from proxy headers (behind nginx / load balancer).
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
