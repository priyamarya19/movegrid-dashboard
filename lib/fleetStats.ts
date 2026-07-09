import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";
import { VSTATUS } from "@/lib/vehicleStatus";

// Single source of truth for vehicle/rider status counts — every dashboard
// (Admin/Ops/Investor/any future role) calls this same function. A dashboard only
// decides which of these fields to show and how (cards, donut, bar); it never
// re-queries or re-derives the counts itself.
export const getFleetRiderCounts = unstable_cache(async function getFleetRiderCounts() {
  const S = schemas.ops;
  const [vehicles, riders] = await Promise.all([
    pool.query(`SELECT status, COUNT(*) FROM ${S}.vehicles GROUP BY status`),
    pool.query(`SELECT status, COUNT(*) FROM ${S}.riders GROUP BY status`),
  ]);

  const vMap: Record<string, number> = {};
  vehicles.rows.forEach((r: { status: string; count: string }) => { vMap[r.status] = Number(r.count); });
  const totalVehicles = Object.values(vMap).reduce((a, b) => a + b, 0);

  const rMap: Record<string, number> = {};
  riders.rows.forEach((r: { status: string; count: string }) => { rMap[r.status] = Number(r.count); });

  const assignedVehicles = vMap[VSTATUS.assigned] ?? 0;
  const availableVehicles = vMap[VSTATUS.available] ?? 0;

  return {
    assignedVehicles,
    availableVehicles,
    // Everything that isn't deployed or ready-to-deploy: under maintenance, returned,
    // retired, blocked, etc. Keeps Deployed + Available + Not Available = total.
    notAvailableVehicles: totalVehicles - assignedVehicles - availableVehicles,
    totalVehicles,
    activeRiders: rMap["active"] ?? 0,
    inactiveRiders: rMap["inactive"] ?? 0,
    pendingRiders: rMap["pending"] ?? 0,
  };
}, ["fleet-rider-counts-v1"], { revalidate: 60 });
