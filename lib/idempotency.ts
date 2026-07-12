import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

// Server half of the mobile idempotency contract (see the app's Idempotency-Key
// header). Flow per money/state write:
//   const idem = await beginIdempotency(req, "rent-received", session.userId);
//   if (idem.mode === "replay") return idem.response;   // duplicate — return first result
//   ...do the work, build { body, status }...
//   if (idem.mode === "claimed") await finishIdempotency(idem, status, body);
//   return NextResponse.json(body, { status });
// On an error/early-return BEFORE finishing, call abortIdempotency(idem) so the
// operator can correct and resubmit (we don't want to cache a validation failure).

const WINDOW_MS = 24 * 60 * 60 * 1000; // keys are honored for 24h

type Claimed = { mode: "claimed"; scope: string; key: string };
export type IdemResult =
  | { mode: "skip" } // no key header — behave exactly as before
  | { mode: "replay"; response: NextResponse }
  | Claimed;

export async function beginIdempotency(req: Request, scope: string, userId?: string): Promise<IdemResult> {
  const key = req.headers.get("Idempotency-Key");
  if (!key) return { mode: "skip" };
  const S = schemas.ops;

  // Claim the key. If we insert the row, we own this operation.
  const claim = await pool.query(
    `INSERT INTO ${S}.idempotency_keys (key, scope, user_id, status)
     VALUES ($1, $2, $3, 'pending') ON CONFLICT (scope, key) DO NOTHING RETURNING key`,
    [key, scope, userId ?? null]
  );
  if (claim.rows[0]) return { mode: "claimed", scope, key };

  // Someone already claimed it — inspect the existing row.
  const { rows } = await pool.query(
    `SELECT status, response_status, response_body,
            (extract(epoch FROM now() - created_at) * 1000) AS age_ms
     FROM ${S}.idempotency_keys WHERE scope = $1 AND key = $2`,
    [scope, key]
  );
  const row = rows[0];
  if (!row) return { mode: "claimed", scope, key }; // vanished between calls — treat as ours

  // Past the window: reclaim the stale key for a fresh operation.
  if (Number(row.age_ms) > WINDOW_MS) {
    await pool.query(
      `UPDATE ${S}.idempotency_keys SET status = 'pending', response_status = NULL,
              response_body = NULL, user_id = $3, created_at = now() WHERE scope = $1 AND key = $2`,
      [scope, key, userId ?? null]
    );
    return { mode: "claimed", scope, key };
  }

  if (row.status === "done") {
    return { mode: "replay", response: NextResponse.json(row.response_body, { status: row.response_status ?? 200 }) };
  }
  // Still in flight (first request hasn't finished) — tell the client to back off,
  // never to blindly re-submit. 409 keeps it out of the app's "network error" retry.
  return {
    mode: "replay",
    response: NextResponse.json(
      { error: "This request is already being processed.", code: "in_progress" },
      { status: 409 }
    ),
  };
}

export async function finishIdempotency(claim: Claimed, status: number, body: unknown): Promise<void> {
  await pool.query(
    `UPDATE ${schemas.ops}.idempotency_keys
       SET status = 'done', response_status = $3, response_body = $4
     WHERE scope = $1 AND key = $2`,
    [claim.scope, claim.key, status, JSON.stringify(body ?? {})]
  );
}

export async function abortIdempotency(claim: Claimed): Promise<void> {
  await pool.query(
    `DELETE FROM ${schemas.ops}.idempotency_keys WHERE scope = $1 AND key = $2`,
    [claim.scope, claim.key]
  );
}
