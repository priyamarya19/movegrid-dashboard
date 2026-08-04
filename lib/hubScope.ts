import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

/**
 * Hub-level data scoping.
 *
 * `null` means "every hub" — admins are deliberately unscoped so they keep a
 * fleet-wide view (and can narrow it themselves with an explicit ?hub= filter).
 * Any other role sees only the hubs granted in mg_data.user_hub_access; a user
 * with no grants sees nothing, which is the safe default when someone is added
 * without being assigned a hub.
 *
 * With one hub this is a no-op — every scoped query returns exactly what it
 * returned before. It starts mattering the day hub #2 opens, which is precisely
 * why it is built now rather than retrofitted onto live multi-hub data.
 */
export type HubScope = string[] | null;

export async function getHubScope(userId: string, role: string): Promise<HubScope> {
  if (role === "admin") return null;
  const res = await pool.query(
    `SELECT hub_id FROM ${schemas.ops}.user_hub_access WHERE user_id = $1`,
    [userId]
  );
  return res.rows.map((r: { hub_id: string }) => r.hub_id);
}

/**
 * SQL fragment restricting a query to the scope.
 *
 * `column` is the hub column to test (e.g. "v.hub_id", "r.assigned_hub_id").
 * Rows whose hub is NULL are kept: an unallotted rider or a vehicle not yet
 * placed at a hub belongs to no hub, and hiding those would make the leads
 * pipeline and fresh stock disappear for ops staff.
 *
 * Returns "" when unscoped so callers can interpolate it unconditionally.
 */
export function hubScopeSql(scope: HubScope, column: string): string {
  if (scope === null) return "";
  if (scope.length === 0) return " AND false";
  // Values come from user_hub_access (DB-generated UUIDs), never from a request —
  // the shape check is belt-and-braces before interpolation.
  const ids = scope.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return " AND false";
  const list = ids.map((id) => `'${id}'::uuid`).join(", ");
  return ` AND (${column} IS NULL OR ${column} IN (${list}))`;
}

/** True when the user may act on the given hub (null hub = unplaced, allowed). */
export function scopeAllowsHub(scope: HubScope, hubId: string | null): boolean {
  if (scope === null) return true;
  if (hubId === null) return true;
  return scope.includes(hubId);
}
