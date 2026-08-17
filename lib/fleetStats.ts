import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { cached } from "@/lib/cache";
import { VSTATUS } from "@/lib/vehicleStatus";
import { hubScopeSql, type HubScope } from "@/lib/hubScope";

// Single source of truth for vehicle/rider status counts — every dashboard
// (Admin/Ops/Investor/any future role) calls this same function. A dashboard only
// decides which of these fields to show and how (cards, donut, bar); it never
// re-queries or re-derives the counts itself.
export const getFleetRiderCounts = cached(async function getFleetRiderCounts(scope: HubScope = null) {
  const S = schemas.ops;
  const [vehicles, riders, availableRiders] = await Promise.all([
    pool.query(`SELECT status, COUNT(*) FROM ${S}.vehicles v WHERE true${hubScopeSql(scope, 'v.hub_id')} GROUP BY status`),
    pool.query(`SELECT status, COUNT(*) FROM ${S}.riders r WHERE true${hubScopeSql(scope, 'r.assigned_hub_id')} GROUP BY status`),
    // "Available" = pending AND KYC done. KYC done = Aadhaar + PAN captured
    // (photo or number) — DL is deliberately excluded (only mandatory for
    // high-speed vehicles, enforced at allotment by the high-speed gate).
    // Document presence, not the verified checkboxes: verification flags are
    // newer than most riders and unset on legitimately-onboarded ones.
    pool.query(`SELECT COUNT(*)::int AS n FROM ${S}.riders r2
      WHERE r2.status = 'pending'
        AND (r2.aadhaar_front_url IS NOT NULL OR COALESCE(r2.aadhaar,'') <> '')
        AND (r2.pan_image_url IS NOT NULL OR COALESCE(r2.pan,'') <> '')
        ${hubScopeSql(scope, 'r2.assigned_hub_id')}`),
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
    // KYC-done pending riders — the ones genuinely ready for an allotment.
    availableRiders: Number(availableRiders.rows[0]?.n ?? 0),
  };
}, ["fleet-rider-counts-v3"], { revalidate: 60 });
