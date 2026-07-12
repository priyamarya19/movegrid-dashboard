import { Pool } from "pg";
import fs from "fs";

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

if (!global.__mgPool) {
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
