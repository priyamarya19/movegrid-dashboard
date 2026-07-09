import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";

// Single source of truth for the recent-riders list — any dashboard/role that needs
// this calls this same function instead of re-querying. Currently shown on
// OpsManagerHome; reusable as-is for any future role.
export const getRecentRiders = unstable_cache(async function getRecentRiders() {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id, r.name, r.mobile, r.status, r.created_at,
           v.ev_number, v.id AS vehicle_id, h.hub_name
    FROM ${S}.riders r
    LEFT JOIN ${S}.rider_vehicle_assignments rva ON rva.rider_id = r.id AND rva.status = 'active'
    LEFT JOIN ${S}.vehicles v ON v.id = rva.vehicle_id
    LEFT JOIN ${S}.hubs h ON h.id = r.assigned_hub_id
    ORDER BY r.created_at DESC LIMIT 10
  `);
  return res.rows;
}, ["recent-riders-v1"], { revalidate: 60 });
