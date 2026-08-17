import { Pool } from "pg";
import fs from "fs";
import { invalidateAll } from "@/lib/cache";

// TLS to RDS. By default the connection is encrypted but the server cert isn't
// verified (rejectUnauthorized:false) — MITM-able. Set RDS_CA_PATH to the AWS RDS
// CA bundle (download the global bundle from AWS onto the box) to turn on full
// verification. Opt-in so enabling it can't unexpectedly break a live connection.
const caPath = process.env.RDS_CA_PATH;
const sslConfig = caPath
  ? { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true }
  : { rejectUnauthorized: false };

// Reuse a single pool across HMR reloads (dev) and the process lifetime (prod),
// so we never stack pools or keep-alive timers.
declare global {
  // eslint-disable-next-line no-var
  var __mgPool: Pool | undefined;
}

const pool =
  global.__mgPool ??
  new Pool({
    host: process.env.RDS_HOST,
    port: Number(process.env.RDS_PORT) || 5432,
    user: process.env.RDS_USER,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DATABASE,
    ssl: sslConfig,
    max: 10,
    // Keep idle connections around for 5 min instead of 30s, so navigations
    // after a short pause reuse a warm connection rather than reconnecting.
    idleTimeoutMillis: 5 * 60 * 1000,
    connectionTimeoutMillis: 5000,
    // TCP keep-alive stops NAT/firewalls/RDS from silently dropping idle sockets.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    allowExitOnIdle: false,
  });

// ── Cache invalidation choke point ───────────────────────────────────────────
//
// Every write in this app reaches the database through this pool, so this is the
// one place that cannot be forgotten: a route added a year from now is covered
// without its author knowing the cache exists. That was the whole failure mode
// before — 42 write routes, none of which invalidated anything, so the dashboard
// served an hour-old vehicle count.
//
// The hook sits on the client, not the pool: `pool.query` internally checks out a
// client and calls client.query, so instrumenting clients as they connect covers
// both the one-shot path and the 11 routes that run transactions on a checked-out
// client. (Wrapping pool.connect instead looks tempting and is a trap — pg calls
// it internally with a callback, and a promise-only override deadlocks every
// query in the app.)
//
// COMMIT counts as a write because a transaction's real work is only observable
// to other readers once it commits.
const LEADING_NOISE = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*/;
const WRITE_SQL = /^(insert|update|delete|commit)\b/i;
// A data-modifying CTE (`WITH x AS (...) INSERT INTO ...`) starts with WITH, so
// the leading-keyword test misses it. None exist today; one written later must
// not silently reintroduce the stale-dashboard bug. Matching `update <x> set`
// rather than bare `update` keeps column names like updated_at out of it.
const WRITE_CTE = /\b(insert\s+into|update\s+\S+\s+set|delete\s+from)\b/i;

function isWrite(sql: string): boolean {
  const s = sql.replace(LEADING_NOISE, "");
  if (WRITE_SQL.test(s)) return true;
  return /^with\b/i.test(s) && WRITE_CTE.test(s);
}

function sqlText(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object" && typeof (arg as { text?: unknown }).text === "string") {
    return (arg as { text: string }).text;
  }
  return "";
}

function noteWrite(arg: unknown): boolean {
  if (!isWrite(sqlText(arg))) return false;
  // Clear immediately so nothing already cached survives the write, and again on
  // completion so a read that raced the write can't repopulate with old rows.
  invalidateAll("db-write");
  return true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function instrument(target: { query: (...a: any[]) => any }): void {
  const original = target.query.bind(target);
  target.query = function (...args: any[]) {
    if (!noteWrite(args[0])) return original(...args);
    const result = original(...args);
    // Callback form (unused here, but the pg API allows it) has no promise.
    if (result && typeof result.then === "function") {
      return result.finally(() => invalidateAll("db-write-settled"));
    }
    invalidateAll("db-write-settled");
    return result;
  } as typeof target.query;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

if (!global.__mgPool) {
  // Fires once per physical connection, before it is handed to anyone.
  pool.on("connect", (client) => instrument(client));

  // Don't let an idle-client error crash the process.
  pool.on("error", (err) => {
    console.error("pg pool error:", err.message);
  });

  // Warm one connection at startup so the first request doesn't pay the SSL handshake.
  pool.query("SELECT 1").catch(() => {});

  // Periodic ping keeps a connection alive (resets both client and RDS idle timers),
  // which is what removes the "first load after idle is slow" cold start.
  const keepAlive = setInterval(() => {
    pool.query("SELECT 1").catch(() => {});
  }, 4 * 60 * 1000);
  // Don't keep the process alive just for the ping.
  keepAlive.unref?.();

  global.__mgPool = pool;
}

export default pool;
