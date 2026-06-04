import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const b = await req.json();
  if (!b.hub_name || !b.city) return NextResponse.json({ error: "Hub name and city are required" }, { status: 400 });

  const result = await pool.query(`
    INSERT INTO ${schemas.ops}.hubs (
      hub_name, city, area, vehicle_capacity,
      owner_name, owner_mobile, security_deposit, monthly_rent, agreement_pdf_url
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id, hub_name, city`,
    [
      b.hub_name, b.city, b.area ?? null, b.vehicle_capacity ?? null,
      b.owner_name ?? null, b.owner_mobile ?? null,
      b.security_deposit ?? null, b.monthly_rent ?? null, b.agreement_pdf_url ?? null,
    ]
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session || !["admin", "ops_manager", "hub_incharge"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await pool.query(`
    SELECT h.id, h.hub_id, h.hub_name, h.city, h.area, h.vehicle_capacity,
           COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'active') AS active_riders,
           COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'assigned') AS assigned_vehicles,
           COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'available') AS available_vehicles
    FROM ${schemas.ops}.hubs h
    LEFT JOIN ${schemas.ops}.riders r ON r.assigned_hub_id = h.id
    LEFT JOIN ${schemas.ops}.vehicles v ON v.hub_id = h.id
    GROUP BY h.id
    ORDER BY h.hub_name
  `);

  return NextResponse.json(result.rows);
}
