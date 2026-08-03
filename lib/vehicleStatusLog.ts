import type { Pool, PoolClient } from "pg";
import { schemas } from "@/lib/schemas";

// One write path for the vehicle state history (migration 021). Every status
// transition — manual button, return, replacement, recovery, allotment — lands
// here so the Vehicle History timeline is complete from launch onward.
export async function logVehicleStatus(
  db: Pool | PoolClient,
  args: {
    vehicleId: string;
    from?: string | null;
    to: string;
    reason?: string | null;
    source: "manual" | "return" | "replacement" | "recovery" | "allotment";
    actor?: string | null;
  }
): Promise<void> {
  await db.query(
    `INSERT INTO ${schemas.ops}.vehicle_status_log (vehicle_id, from_status, to_status, reason, source, actor)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [args.vehicleId, args.from ?? null, args.to, args.reason?.trim() || null, args.source, args.actor ?? null]
  );
}
