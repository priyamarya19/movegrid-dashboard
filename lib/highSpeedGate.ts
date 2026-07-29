import type { Pool, PoolClient } from "pg";
import { schemas } from "@/lib/schemas";

// The moment-of-truth enforcement of the document rule: a HIGH-SPEED vehicle
// (vehicle_models.is_high_speed) can only be allotted/swapped to a rider who has
// DL and PAN on file — number AND photo each. The rider-app KYC merely front-
// loads the documents by preference; this gate is what actually guarantees no
// rider rides high-speed undocumented, on every path (allotment, replacement).
export async function highSpeedDocsMissing(
  db: Pool | PoolClient,
  vehicleId: string,
  riderId: string
): Promise<string | null> {
  const S = schemas.ops;
  const res = await db.query(
    `SELECT COALESCE(m.is_high_speed, false) AS is_high_speed,
            r.dl_number, r.dl_front_url, r.pan, r.pan_image_url
     FROM ${S}.vehicles v
     LEFT JOIN ${S}.vehicle_models m ON m.id = v.model_id
     CROSS JOIN ${S}.riders r
     WHERE v.id = $1 AND r.id = $2`,
    [vehicleId, riderId]
  );
  const row = res.rows[0];
  if (!row || !row.is_high_speed) return null;

  const missing: string[] = [];
  if (!row.dl_number || !row.dl_front_url) missing.push("DL (number + photo)");
  if (!row.pan || !row.pan_image_url) missing.push("PAN (number + photo)");
  if (missing.length === 0) return null;
  return `High-speed vehicle — the rider must have ${missing.join(" and ")} on file first. They can upload from the rider app (Documents) or you can add them on the rider page.`;
}
