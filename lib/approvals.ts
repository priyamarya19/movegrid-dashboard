import crypto from "crypto";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { sendEmail } from "@/lib/email";

/**
 * Admin approval for actions ops can't take alone.
 *
 * Ops raise a request, the chosen admins are emailed a 6-digit code, the admin
 * reads it back over the phone, ops type it in. Only then will the guarded
 * mutation run.
 *
 * The approval is bound to a FINGERPRINT — a canonical string of the fields
 * that matter. The mutation re-derives it and refuses if it differs, so a code
 * issued for "start date 29 Aug" cannot be spent on 25 Aug instead. Without
 * that, the gate is theatre.
 */

export type ApprovalAction = "rider_edit" | "allotment_start_date";

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;

const hash = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

/** Six digits, uniformly drawn — Math.random is not good enough for a gate. */
function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Canonical, order-independent description of what is being approved. */
export function fingerprint(action: ApprovalAction, parts: Record<string, unknown>): string {
  const body = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k] === null || parts[k] === undefined ? "" : String(parts[k])}`)
    .join("&");
  return `${action}|${body}`;
}

export async function listApprovers(action: ApprovalAction) {
  const res = await pool.query(
    `SELECT u.id, u.name, u.email
       FROM ${schemas.ops}.approval_approvers a
       JOIN ${schemas.auth}.users u ON u.id = a.user_id
      WHERE u.status = 'active' AND $1 = ANY(a.actions)
      ORDER BY u.name`,
    [action]
  );
  return res.rows as { id: string; name: string; email: string }[];
}

/**
 * Raise a request and email the code. Returns the request id; the code itself
 * is never returned to the caller — that is the whole point.
 */
export async function requestApproval(args: {
  action: ApprovalAction;
  subjectId?: string | null;
  summary: string;
  fingerprint: string;
  requestedBy: string;
  requestedByName: string;
}): Promise<{ id: string; sentTo: string[] }> {
  const approvers = await listApprovers(args.action);
  if (!approvers.length) {
    // Deliberately a hard stop. A gate that opens when nobody is configured to
    // guard it is worse than no gate, because everyone believes it is working.
    throw new Error("No admin is set up to approve this. Add one in Settings → Approvals.");
  }

  const code = generateCode();
  const res = await pool.query(
    `INSERT INTO ${schemas.ops}.approval_requests
       (action, subject_id, summary, fingerprint, code_hash, requested_by, requested_by_name, sent_to, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + ($9 || ' minutes')::interval)
     RETURNING id`,
    [
      args.action, args.subjectId ?? null, args.summary, args.fingerprint, hash(code),
      args.requestedBy, args.requestedByName, approvers.map((a) => a.email), String(CODE_TTL_MINUTES),
    ]
  );

  await sendEmail({
    to: approvers.map((a) => a.email),
    subject: `MOVEGRID approval code ${code} — ${args.summary}`,
    text:
      `${args.requestedByName} is asking to make a change that needs your approval.\n\n` +
      `  ${args.summary}\n\n` +
      `Approval code: ${code}\n` +
      `Valid for ${CODE_TTL_MINUTES} minutes.\n\n` +
      `Only give this code to ${args.requestedByName} if you are happy with the change above. ` +
      `If you are not expecting this request, do not share it.`,
  });

  return { id: res.rows[0].id, sentTo: approvers.map((a) => a.email) };
}

/** Ops entering the code the admin read out. */
export async function confirmApproval(args: {
  id: string;
  code: string;
  approverName?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await pool.query(
    `SELECT id, status, code_hash, attempts, expires_at FROM ${schemas.ops}.approval_requests WHERE id = $1`,
    [args.id]
  );
  const r = res.rows[0];
  if (!r) return { ok: false, error: "That approval request no longer exists" };
  if (r.status === "consumed") return { ok: false, error: "That code has already been used" };
  if (r.status !== "pending") return { ok: false, error: `This request is ${r.status}` };
  if (new Date(r.expires_at) < new Date()) {
    await pool.query(`UPDATE ${schemas.ops}.approval_requests SET status='expired' WHERE id=$1`, [args.id]);
    return { ok: false, error: "That code has expired — ask for a new one" };
  }
  if (r.attempts >= MAX_ATTEMPTS) {
    await pool.query(`UPDATE ${schemas.ops}.approval_requests SET status='failed' WHERE id=$1`, [args.id]);
    return { ok: false, error: "Too many wrong attempts — ask for a new code" };
  }

  if (hash(String(args.code).trim()) !== r.code_hash) {
    await pool.query(`UPDATE ${schemas.ops}.approval_requests SET attempts = attempts + 1 WHERE id=$1`, [args.id]);
    return { ok: false, error: "That code is not right" };
  }

  await pool.query(
    `UPDATE ${schemas.ops}.approval_requests
     SET status='approved', approved_at = now(), approved_by_name = $2 WHERE id = $1`,
    [args.id, args.approverName ?? null]
  );
  return { ok: true };
}

/**
 * Called by the guarded mutation. Checks the approval is real, approved, still
 * valid, and — crucially — was granted for exactly this change, then marks it
 * spent so it cannot be replayed.
 *
 * Runs on the caller's client so it commits or rolls back with the mutation.
 */
export async function consumeApproval(
  client: PoolClient,
  args: { id: string; action: ApprovalAction; fingerprint: string }
): Promise<{ ok: true; approvedBy: string | null } | { ok: false; error: string }> {
  const res = await client.query(
    `SELECT id, action, status, fingerprint, approved_by_name, expires_at
       FROM ${schemas.ops}.approval_requests WHERE id = $1 FOR UPDATE`,
    [args.id]
  );
  const r = res.rows[0];
  if (!r) return { ok: false, error: "Approval not found" };
  if (r.status !== "approved") return { ok: false, error: "This change has not been approved yet" };
  if (r.action !== args.action) return { ok: false, error: "That approval was for a different kind of change" };
  if (r.fingerprint !== args.fingerprint) {
    return { ok: false, error: "The change was edited after it was approved — ask for a new code" };
  }
  if (new Date(r.expires_at) < new Date()) return { ok: false, error: "That approval has expired" };

  await client.query(
    `UPDATE ${schemas.ops}.approval_requests SET status='consumed', consumed_at = now() WHERE id = $1`,
    [args.id]
  );
  return { ok: true, approvedBy: r.approved_by_name };
}
