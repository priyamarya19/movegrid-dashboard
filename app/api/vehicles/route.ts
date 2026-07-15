import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { VSTATUS, NOT_AVAILABLE } from "@/lib/vehicleStatus";

export async function POST(req: NextRequest) {
  const guard = await requireRole(req, ["admin", "ops_manager"]);
  if ("response" in guard) return guard.response;
  const b = await req.json();
  if (!b.ev_number || !b.oem) return NextResponse.json({ error: "EV number and OEM are required" }, { status: 400 });

  const dup = await pool.query(`SELECT id FROM ${schemas.ops}.vehicles WHERE ev_number = $1`, [b.ev_number]);
  if (dup.rows[0]) return NextResponse.json({ error: "A vehicle with this EV number already exists" }, { status: 409 });

  // Resolve model_id from oem
  const model = await pool.query(`SELECT id FROM ${schemas.ops}.vehicle_models WHERE oem = $1 LIMIT 1`, [b.oem]);
  if (!model.rows[0]) return NextResponse.json({ error: "Unknown OEM/Assembler" }, { status: 400 });

  const result = await pool.query(`
    INSERT INTO ${schemas.ops}.vehicles (
      ev_number, chassis_number, motor_number, controller_number,
      iot_imei, iot_partner, battery_number, battery_partner,
      model_id, hub_id, status, purchase_date, price,
      vehicle_photo_url, rc_book_url, vehicle_photos
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ready_to_deploy',$11,$12,$13,$14,$15)
    RETURNING id, ev_number, status`,
    [
      b.ev_number, b.chassis_number ?? null, b.motor_number ?? null, b.controller_number ?? null,
      b.iot_imei ?? null, b.iot_partner ?? null, b.battery_number ?? null, b.battery_partner ?? null,
      model.rows[0].id, b.hub_id ?? null, b.purchase_date || null, b.price ?? null,
      b.vehicle_photo_url ?? null, b.rc_book_url ?? null, b.vehicle_photos ?? null,
    ]
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}

export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const unassigned = searchParams.get("unassigned");
  // Opt-in pagination (dashboard sends ?page=); mobile/unpaginated path unchanged.
  const pageParam = searchParams.get("page");
  const paginated = pageParam != null;
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));
  const q = (searchParams.get("q") || "").trim();
  const SORTABLE: Record<string, string> = { ev_number: "v.ev_number", status: "v.status", model_name: "m.model_name" };
  const sortCol = SORTABLE[searchParams.get("sort") || ""] || "v.ev_number";
  const sortDir = searchParams.get("dir") === "desc" ? "DESC" : "ASC";

  let query = `
    SELECT v.id, v.ev_number, v.status, v.purchase_date, v.price,
           m.model_name, m.oem,
           h.id AS hub_id, h.hub_name,
           v.investor_id, u.name AS investor_name,
           rva.rider_id, r.name AS assigned_rider
    FROM ${schemas.ops}.vehicles v
    LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
    LEFT JOIN ${schemas.ops}.hubs h ON h.id = v.hub_id
    LEFT JOIN ${schemas.ops}.investor_profiles ip ON ip.id = v.investor_id
    LEFT JOIN ${schemas.auth}.users u ON u.id = ip.user_id
    LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.vehicle_id = v.id AND rva.status = 'active'
    LEFT JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
    WHERE 1=1
  `;
  const params: string[] = [];
  let where = "WHERE 1=1";
  if (status === NOT_AVAILABLE) {
    params.push(VSTATUS.assigned, VSTATUS.available);
    const cond = ` AND v.status NOT IN ($${params.length - 1}, $${params.length})`;
    query += cond; where += cond;
  } else if (status) {
    params.push(status); const cond = ` AND v.status = $${params.length}`;
    query += cond; where += cond;
  }
  if (unassigned) { query += ` AND v.investor_id IS NULL`; where += ` AND v.investor_id IS NULL`; }
  if (q) {
    // Search EV number, chassis, or the current rider's name (EXISTS keeps the
    // count query join-free).
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    const cond = ` AND (v.ev_number ILIKE ${p} OR v.chassis_number ILIKE ${p} OR EXISTS (
      SELECT 1 FROM ${schemas.ops}.rider_vehicle_assignments a2
      JOIN ${schemas.ops}.riders r2 ON r2.id = a2.rider_id
      WHERE a2.vehicle_id = v.id AND a2.status = 'active' AND r2.name ILIKE ${p}))`;
    query += cond; where += cond;
  }
  query += ` ORDER BY ${sortCol} ${sortDir} NULLS LAST`;
  query += paginated ? ` LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}` : ` LIMIT 500`;

  const [result, countRes] = await Promise.all([
    pool.query(query, params),
    pool.query(`SELECT count(*)::int AS n FROM ${schemas.ops}.vehicles v ${where}`, params),
  ]);
  const headers: Record<string, string> = { "X-Total-Count": String(countRes.rows[0]?.n ?? result.rows.length) };
  if (paginated) {
    const sc = await pool.query(`SELECT status, count(*)::int AS n FROM ${schemas.ops}.vehicles GROUP BY status`);
    const counts: Record<string, number> = {};
    for (const row of sc.rows) counts[row.status] = row.n;
    headers["X-Status-Counts"] = JSON.stringify(counts);
  }
  return NextResponse.json(result.rows, { headers });
}
