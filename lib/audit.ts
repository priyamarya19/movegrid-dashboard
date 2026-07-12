import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

// Append-only audit trail. Best-effort by design: a failure to write the audit
// row must NEVER break the operation it records, so every call is wrapped in
// try/catch and swallows errors (logged server-side). Call it AFTER the main
// operation has committed, so a rolled-back operation leaves no audit row.
type AuditEntry = {
  action: string;            // e.g. "rent_received", "vehicle_returned"
  entity: string;            // e.g. "rider", "assignment", "user"
  entityId?: string | null;  // the affected row's id
  actorId?: string | null;   // session.userId
  actorName?: string | null; // session.name (stored in details for readability)
  details?: Record<string, unknown>;
  req?: Request;             // for the client IP
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const ip = entry.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? entry.req?.headers.get("x-real-ip")
      ?? null;
    const details = {
      ...(entry.details ?? {}),
      ...(entry.actorName ? { actor: entry.actorName } : {}),
    };
    await pool.query(
      `INSERT INTO ${schemas.logs}.audit_logs (action, entity, entity_id, actor_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.action, entry.entity, entry.entityId ?? null, entry.actorId ?? null, JSON.stringify(details), ip]
    );
  } catch (e) {
    console.error("audit write failed:", (e as Error).message);
  }
}
