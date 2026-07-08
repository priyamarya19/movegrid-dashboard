import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

// rental_mode is constrained by riders_rental_mode_check to ('weekly','monthly').
// Normalize known display labels; reject anything else with a 400 rather than
// letting it hit the DB and surface as a raw 500.
const RENTAL_MODES = new Set(["weekly", "monthly"]);
function normalizeRentalMode(raw: unknown): string | null {
  if (raw == null || raw === "") return "monthly";
  const v = String(raw).trim().toLowerCase();
  if (v === "week" || v === "weekly") return "weekly";
  if (v === "month" || v === "monthly") return "monthly";
  return RENTAL_MODES.has(v) ? v : null;
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  try {
    const b = await req.json();
    if (!b.name || !b.mobile) return NextResponse.json({ error: "Name and mobile are required" }, { status: 400 });

    const rentalMode = normalizeRentalMode(b.rental_mode);
    if (rentalMode === null) {
      return NextResponse.json(
        { error: "rental_mode must be one of: weekly, monthly", field: "rental_mode" },
        { status: 400 }
      );
    }

    // Pre-check duplicate mobile (fast, friendly path). The DB UNIQUE
    // constraints below are the real guard against races.
    const dup = await pool.query(`SELECT id FROM ${schemas.ops}.riders WHERE mobile = $1`, [b.mobile]);
    if (dup.rows[0]) return NextResponse.json({ error: "A rider with this mobile number already exists", field: "mobile" }, { status: 409 });

    const result = await pool.query(`
    INSERT INTO ${schemas.ops}.riders (
      rider_code,
      name, nickname, mobile, current_address, permanent_address, current_address_location,
      aadhaar, aadhaar_front_url, aadhaar_back_url,
      pan, pan_image_url,
      dl_number, dl_front_url, dl_back_url, bank_doc_url,
      bank, ifsc, account_number,
      family_ref_name, family_ref_mobile, family_ref_aadhaar, family_ref_aadhaar_url,
      local_ref_name, local_ref_mobile,
      rental_mode, business_type, b2b_company, b2b_location, employer,
      onboarding_fee, security_deposit,
      profile_photo_url, assigned_hub_id, status, created_by
    ) VALUES (
      'MG' || LPAD(NEXTVAL('${schemas.ops}.rider_code_seq')::TEXT, 6, '0'),
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35
    ) RETURNING id, rider_code, name, mobile, status`,
    [
      b.name, b.nickname ?? null, b.mobile,
      b.current_address ?? null, b.permanent_address ?? null, b.address_map_link ?? null,
      b.aadhaar ?? null, b.aadhaar_front_url ?? null, b.aadhaar_back_url ?? null,
      b.pan ?? null, b.pan_image_url ?? null,
      b.dl_number ?? null, b.dl_front_url ?? null, b.dl_back_url ?? null, b.bank_doc_url ?? null,
      b.bank ?? null, b.ifsc ?? null, b.account_number ?? null,
      b.family_ref_name ?? null, b.family_ref_mobile ?? null, b.family_ref_aadhaar ?? null, b.family_ref_aadhaar_url ?? null,
      b.local_ref_name ?? null, b.local_ref_mobile ?? null,
      rentalMode, b.business_type ?? "rental", b.b2b_company ?? null, b.b2b_location ?? null, b.employer ?? null,
      b.onboarding_fee ?? null, b.security_deposit ?? null,
      b.profile_photo_url ?? null, b.assigned_hub_id ?? null, "pending", session.name,
    ]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    // 23505 unique_violation — name the duplicated field.
    if (e.code === "23505") {
      const field = e.constraint === "riders_aadhaar_key" ? "aadhaar" : "mobile";
      const label = field === "aadhaar" ? "Aadhaar number" : "mobile number";
      return NextResponse.json(
        { error: `A rider with this ${label} already exists`, field },
        { status: 409 }
      );
    }
    // 23514 check_violation — e.g. rental_mode / status out of range.
    if (e.code === "23514") {
      const field = e.constraint === "riders_rental_mode_check" ? "rental_mode"
        : e.constraint === "riders_status_check" ? "status" : undefined;
      return NextResponse.json(
        { error: "A submitted value is not allowed", field },
        { status: 400 }
      );
    }
    // 23503 foreign_key_violation — e.g. assigned_hub_id points to no hub.
    if (e.code === "23503") {
      const field = e.constraint === "riders_assigned_hub_id_fkey" ? "assigned_hub_id" : undefined;
      return NextResponse.json(
        { error: "A referenced record does not exist", field },
        { status: 400 }
      );
    }
    // Genuinely unexpected — log server-side, return a safe generic message.
    console.error("POST /api/riders failed:", err);
    return NextResponse.json({ error: "Failed to create rider" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const hub = searchParams.get("hub");
  const rent = searchParams.get("rent"); // "overdue" | "due_soon"

  // Use IST-aware dates — all created_at values are stored as IST midnight (18:30 UTC prev day)
  const T = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`;           // IST today
  const J = `(r.created_at AT TIME ZONE 'Asia/Kolkata')::date`;    // IST join date
  const D = `EXTRACT(day FROM (r.created_at AT TIME ZONE 'Asia/Kolkata'))`; // IST join day-of-month
  const M = `DATE_TRUNC('month', ${T})`;                            // IST month start

  const rentDueCTE = `
    WITH rent_due AS (
      SELECT r.id,
        CASE r.rental_mode WHEN 'weekly' THEN 7 WHEN 'fortnightly' THEN 14 ELSE 30 END AS period_days,
        CASE r.rental_mode
          WHEN 'weekly'      THEN (${J} + (GREATEST(CEIL((${T} - ${J})::float / 7),  1) *  7)::int)
          WHEN 'fortnightly' THEN (${J} + (GREATEST(CEIL((${T} - ${J})::float / 14), 1) * 14)::int)
          ELSE CASE
            WHEN (${M} + (${D} - 1) * INTERVAL '1 day')::date >= ${T}
            THEN (${M} + (${D} - 1) * INTERVAL '1 day')::date
            ELSE (${M} + INTERVAL '1 month' + (${D} - 1) * INTERVAL '1 day')::date
          END
        END AS next_due_date,
        CASE r.rental_mode
          WHEN 'weekly'      THEN (${J} + (FLOOR((${T} - ${J})::float / 7)  *  7)::int)
          WHEN 'fortnightly' THEN (${J} + (FLOOR((${T} - ${J})::float / 14) * 14)::int)
          ELSE CASE
            WHEN (${M} + (${D} - 1) * INTERVAL '1 day')::date <= ${T}
            THEN (${M} + (${D} - 1) * INTERVAL '1 day')::date
            ELSE (${M} - INTERVAL '1 month' + (${D} - 1) * INTERVAL '1 day')::date
          END
        END AS last_due_date
      FROM ${schemas.ops}.riders r
      WHERE r.status = 'active'
        AND EXISTS (SELECT 1 FROM ${schemas.ops}.rider_vehicle_assignments rva
                    WHERE rva.rider_id = r.id AND rva.status = 'active')
    )
  `;

  const baseSelect = `
    SELECT r.id, r.rider_code, r.name, r.mobile, r.status, r.onboarding_fee, r.security_deposit,
           r.rental_mode, r.business_type, r.b2b_company, r.b2b_location, r.employer, r.created_at,
           r.aadhaar_verified, r.pan_verified, r.dl_verified,
           h.id AS hub_id, h.hub_name,
           v.id AS vehicle_id, v.ev_number AS vehicle_number,
           EXISTS (
             SELECT 1 FROM ${schemas.ops}.rider_payments p
             WHERE p.rider_id = r.id
               AND p.rental_period_start >= date_trunc('month', CURRENT_DATE)
               AND p.rental_period_end <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
           ) AS rent_received_this_month,
           EXISTS (
             SELECT 1 FROM ${schemas.ops}.rider_vehicle_assignments rva_a
             WHERE rva_a.rider_id = r.id AND rva_a.status = 'active'
           ) AS has_active_assignment
    FROM ${schemas.ops}.riders r
    LEFT JOIN ${schemas.ops}.hubs h ON h.id = r.assigned_hub_id
    LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.rider_id = r.id AND rva.status = 'active'
    LEFT JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
  `;

  let query: string;
  const params: string[] = [];

  if (rent === "overdue" || rent === "due_soon") {
    const overdueWhere = `rd.last_due_date < ${T} AND rd.last_due_date > ${J}
      AND NOT EXISTS (SELECT 1 FROM ${schemas.ops}.rider_payments p WHERE p.rider_id = r.id AND p.rental_period_start >= rd.last_due_date - rd.period_days * INTERVAL '1 day' AND p.amount_collected >= 1610)`;
    const dueSoonWhere = `rd.next_due_date BETWEEN ${T} AND ${T} + 2
      AND NOT EXISTS (SELECT 1 FROM ${schemas.ops}.rider_payments p WHERE p.rider_id = r.id AND p.rental_period_start >= rd.next_due_date - rd.period_days * INTERVAL '1 day' AND p.amount_collected >= 1610)`;

    // Subquery to fetch any partial payment for the relevant period
    const partialPaidSubquery = rent === "overdue"
      ? `(SELECT p2.amount_collected FROM ${schemas.ops}.rider_payments p2
           WHERE p2.rider_id = r.id
             AND p2.rental_period_start >= rd.last_due_date - rd.period_days * INTERVAL '1 day'
             AND p2.amount_collected < 1610
           ORDER BY p2.payment_date DESC LIMIT 1) AS partial_paid`
      : `(SELECT p2.amount_collected FROM ${schemas.ops}.rider_payments p2
           WHERE p2.rider_id = r.id
             AND p2.rental_period_start >= rd.next_due_date - rd.period_days * INTERVAL '1 day'
             AND p2.amount_collected < 1610
           ORDER BY p2.payment_date DESC LIMIT 1) AS partial_paid`;

    const rentSelect = baseSelect.replace(
      `FROM ${schemas.ops}.riders r`,
      `, rd.next_due_date, rd.last_due_date, rd.period_days, ${partialPaidSubquery}\n    FROM ${schemas.ops}.riders r`
    );
    query = `${rentDueCTE}
    ${rentSelect}
    JOIN rent_due rd ON rd.id = r.id
    WHERE ${rent === "overdue" ? overdueWhere : dueSoonWhere}
    `;
  } else {
    query = `${baseSelect} WHERE 1=1`;
    if (status) { params.push(status); query += ` AND r.status = $${params.length}`; }
    if (hub) { params.push(hub); query += ` AND h.hub_name = $${params.length}`; }
  }
  query += ` ORDER BY r.created_at DESC LIMIT 200`;

  const result = await pool.query(query, params);
  return NextResponse.json(result.rows);
}
