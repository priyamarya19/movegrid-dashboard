// Dashboard read-cache.
//
// Replaces Next's `unstable_cache` for the home-page/summary blocks. Two things
// were wrong with that arrangement and both are fixed here:
//
//  1. Nothing invalidated it. A vehicle allotted at 13:52 was still missing from
//     the "Available vehicles" card at 14:35, because the only refresh mechanism
//     was a 60-second timer. Here, every write to the database clears the cache
//     (see lib/db.ts) — so the numbers are right the moment ops save something.
//
//  2. Expiry didn't mean fresh. `unstable_cache` serves an EXPIRED entry to the
//     next visitor and refreshes in the background, so the first load after a
//     quiet spell showed the previous snapshot and only a second refresh showed
//     the truth. Here, expired is expired: it re-queries.
//
// The TTL is kept as a safety net for anything that changes without an app write
// (a manual SQL fix, a nightly job), not as the primary freshness mechanism.
//
// Scale note: this cache lives in the process. Today prod is a single fork-mode
// pm2 process, so that is exactly one place. The day a second instance sits
// behind a load balancer, instance A would clear on write while instance B kept
// serving the old number — which is why invalidation goes through the transport
// seam below rather than touching this counter directly. See setInvalidationTransport.

type Entry = { value: unknown; expires: number; version: number };

declare global {
  // eslint-disable-next-line no-var
  var __mgCache: { store: Map<string, Entry>; inflight: Map<string, Promise<unknown>>; version: number } | undefined;
}

// Survives HMR in dev and lives for the process lifetime in prod.
const g = (global.__mgCache ??= { store: new Map(), inflight: new Map(), version: 1 });

/**
 * The invalidation seam.
 *
 * `version` is a generation counter: every cached entry records the generation
 * it was computed in, and an entry from an older generation is dead. Clearing
 * the whole cache is therefore one increment — no key bookkeeping, and no way
 * for a stale entry to survive because someone forgot to name a tag.
 *
 * To go multi-instance, do NOT reach for this counter. Instead:
 *   - call setInvalidationTransport(() => redis.publish("mg:invalidate", "1"))
 *   - and call applyRemoteInvalidation() from the Redis subscriber.
 * That keeps reads local (no round trip per read) while every instance drops its
 * cache on any instance's write.
 */
let broadcast: (reason?: string) => void = () => {};

/** Install the cross-instance transport (Redis publish, SNS, whatever). */
export function setInvalidationTransport(fn: (reason?: string) => void): void {
  broadcast = fn;
}

/** Called by the transport's subscriber when ANOTHER instance reports a write. */
export function applyRemoteInvalidation(): void {
  g.version++;
}

/**
 * Drop every cached read. Called on every database write.
 *
 * Deliberately coarse: a rider's KYC edit also clears the revenue numbers. The
 * queries behind these blocks run in single-digit milliseconds on the server, so
 * the wasted work is not worth the risk of a narrower rule quietly missing a
 * dependency. Narrowing this by table is a change to this function alone.
 */
export function invalidateAll(reason?: string): void {
  g.version++;
  broadcast(reason);
}

type Options = { revalidate?: number };

/**
 * Wrap a read so its result is reused across requests.
 *
 * Signature-compatible with the `unstable_cache` calls it replaced: pass the
 * function, the key parts, and `{ revalidate }` in seconds. Arguments are part
 * of the key, so a hub-scoped caller can't be served another hub's numbers.
 */
export function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
  options: Options = {}
): (...args: A) => Promise<R> {
  const ttlMs = (options.revalidate ?? 60) * 1000;
  const base = keyParts.join(":");

  return async (...args: A): Promise<R> => {
    const key = args.length ? `${base}|${JSON.stringify(args)}` : base;
    const now = Date.now();

    const hit = g.store.get(key);
    if (hit && hit.version === g.version && hit.expires > now) return hit.value as R;

    // Collapse a stampede: ten simultaneous dashboard loads after an allotment
    // should run the query once, not ten times.
    const pending = g.inflight.get(key);
    if (pending) return pending as Promise<R>;

    const version = g.version;
    const run = fn(...args)
      .then((value) => {
        // A write that landed while the query was in flight moves the version on;
        // storing under the old one would serve data we already know is stale.
        if (version === g.version) {
          g.store.set(key, { value, expires: Date.now() + ttlMs, version });
          prune();
        }
        return value;
      })
      .finally(() => {
        g.inflight.delete(key);
      });

    g.inflight.set(key, run);
    return run;
  };
}

/** Keep the map from growing without bound; only runs on writes to the map. */
function prune(): void {
  if (g.store.size < 200) return;
  const now = Date.now();
  for (const [k, e] of g.store) {
    if (e.version !== g.version || e.expires <= now) g.store.delete(k);
  }
}
