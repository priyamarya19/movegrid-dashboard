import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { IST } from "@/lib/rent";
import { writeAudit } from "@/lib/audit";
import { beginIdempotency, finishIdempotency, abortIdempotency } from "@/lib/idempotency";

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

  // A retried create (mobile outbox replaying a network-dropped submit) returns
  // the original result instead of a confusing "already exists" 409.
  const idem = await beginIdempotency(req, "rider-create", session.userId);
  if (idem.mode === "replay") return idem.response;

  try {
    const b = await req.json();
    if (!b.name || !b.mobile) { if (idem.mode === "claimed") await abortIdempotency(idem); return NextResponse.json({ error: "Name and mobile are required" }, { status: 400 }); }

    const rentalMode = normalizeRentalMode(b.rental_mode);
    if (rentalMode === null) {
      if (idem.mode === "claimed") await abortIdempotency(idem);
      return NextResponse.json(
        { error: "rental_mode must be one of: weekly, monthly", field: "rental_mode" },
        { status: 400 }
      );
    }

    // Pre-check duplicate mobile (fast, friendly path). The DB UNIQUE
    // constraints below are the real guard against races.
    const dup = await pool.query(`SELECT id FROM ${schemas.ops}.riders WHERE mobile = $1`, [b.mobile]);
    if (dup.rows[0]) { if (idem.mode === "claimed") await abortIdempotency(idem); return NextResponse.json({ error: "A rider with this mobile number already exists", field: "mobile" }, { status: 409 }); }

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
      profile_photo_url, assigned_hub_id, status, created_by, additional_photos
    ) VALUES (
      'MGR' || LPAD(NEXTVAL('${schemas.ops}.rider_code_seq')::TEXT, 6, '0'),
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
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
      b.profile_photo_url ?? null, b.assigned_hub_id ?? null, "pending", session.name, b.additional_photos ?? null,
    ]
    );
    await writeAudit({
      action: "rider_created", entity: "rider", entityId: result.rows[0].id,
      actorId: session.userId, actorName: session.name, req,
      details: { rider_code: result.rows[0].rider_code, name: result.rows[0].name, mobile: result.rows[0].mobile },
    });
    if (idem.mode === "claimed") await finishIdempotency(idem, 201, result.rows[0]);
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err) {
    if (idem.mode === "claimed") await abortIdempotency(idem);
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
  // Pagination is opt-in: the dashboard sends ?page=1 (and optionally q/sort/dir),
  // the mobile app doesn't and keeps getting the full capped list unchanged.
  const pageParam = searchParams.get("page");
  const paginated = pageParam != null;
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));
  const q = (searchParams.get("q") || "").trim();
  // Whitelist sortable columns so the value can be interpolated safely.
  const SORTABLE: Record<string, string> = {
    name: "r.name", rider_code: "r.rider_code", status: "r.status",
    created_at: "r.created_at", hub_name: "h.hub_name",
  };
  const sortCol = SORTABLE[searchParams.get("sort") || ""] || "r.created_at";
  const sortDir = searchParams.get("dir") === "asc" ? "ASC" : "DESC";

  // Use IST-aware dates
  const T = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`;           // IST today

  // Rolling-balance model (matches lib/rent.ts / lib/reports.ts): computed directly
  // from paid_through_date on the assignment — NOT from rent_dues, which is a
  // periodically-regenerated display ledger that can go stale between runs.
  // paid_through_date is always current, so this can never drift from what the
  // dashboards/reports show.
  const rentDueCTE = `
    WITH rent_due AS (
      SELECT rva.rider_id,
        7 AS period_days,
        (rva.daily_rent * 7) AS period_amount,
        (${T} - COALESCE(rva.paid_through_date, rva.assigned_date - 1)) AS days_behind,
        -- Next due = the rider's weekly cycle boundary, anchored on paid_through_date
        -- (their real payment rhythm — assigned_date goes stale after an issue-swap,
        -- since the continuation assignment restarts mid-tenancy). A rider paid
        -- through the 21st is due on the 21st for the week starting the 22nd. The
        -- date holds through the 2-day grace after a miss, then rolls a week: due
        -- 7th, still unpaid on the 9th → 14th. Never-paid riders anchor on the
        -- allotment date (week 1 due = assigned + 6).
        (CASE WHEN COALESCE(rva.paid_through_date, rva.assigned_date - 1) >= rva.assigned_date
          THEN rva.paid_through_date
               + 7 * CEIL(GREATEST(${T} - 1 - rva.paid_through_date, 0) / 7.0)::int
          ELSE (rva.assigned_date - 1)
               + 7 * GREATEST(1, CEIL(GREATEST(${T} - rva.assigned_date, 0) / 7.0)::int)
        END) AS next_due_date,
        (COALESCE(rva.paid_through_date, rva.assigned_date - 1) + 1) AS last_due_date,
        -- Rent is billed weekly — round up to a whole week even if only partway
        -- into an unpaid one (the day-precise paid_through_date stays exact internally).
        CEIL(GREATEST(${T} - COALESCE(rva.paid_through_date, rva.assigned_date - 1), 1) / 7.0) AS overdue_weeks,
        (CEIL(GREATEST(${T} - COALESCE(rva.paid_through_date, rva.assigned_date - 1), 1) / 7.0) * rva.daily_rent * 7) AS amount_due
      FROM ${schemas.ops}.rider_vehicle_assignments rva
      WHERE rva.status = 'active'
    )
  `;

  const baseSelect = `
    SELECT r.id, r.rider_code, r.name, r.mobile, r.status, r.onboarding_fee, r.security_deposit,
           r.rental_mode, r.business_type, r.b2b_company, r.b2b_location, r.employer, r.created_at,
           r.aadhaar_verified, r.pan_verified, r.dl_verified,
           h.id AS hub_id, h.hub_name,
           v.id AS vehicle_id, v.ev_number AS vehicle_number,
           rva.daily_rent, rva.allotment_code,
           COALESCE(rva.paid_through_date, rva.assigned_date - 1) >= ${IST} AS rent_paid_this_week,
           -- outstanding rent (whole-week-rounded) for the active assignment, 0 if paid up
           CASE WHEN rva.id IS NOT NULL AND COALESCE(rva.paid_through_date, rva.assigned_date - 1) < ${IST}
                THEN CEIL((${IST} - COALESCE(rva.paid_through_date, rva.assigned_date - 1)) / 7.0) * rva.daily_rent * 7
                ELSE 0 END AS amount_due,
           EXISTS (
             SELECT 1 FROM ${schemas.ops}.rider_vehicle_assignments rva_a
             WHERE rva_a.rider_id = r.id AND rva_a.status = 'active'
           ) AS has_active_assignment,
           -- every allotment ID this rider has ever held, so search can match
           -- historical tenancies too (space-joined, matched with includes())
           (SELECT string_agg(rva_all.allotment_code, ' ')
            FROM ${schemas.ops}.rider_vehicle_assignments rva_all
            WHERE rva_all.rider_id = r.id AND rva_all.allotment_code IS NOT NULL) AS allotment_codes
    FROM ${schemas.ops}.riders r
    LEFT JOIN ${schemas.ops}.hubs h ON h.id = r.assigned_hub_id
    LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.rider_id = r.id AND rva.status = 'active'
    LEFT JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
  `;

  const LIMIT = 200;
  let query: string;
  const params: string[] = [];
  let total: number | null = null;

  if (rent === "overdue" || rent === "due_soon" || rent === "pending_week") {
    // 2-day grace: not chased as Overdue until paid_through_date is > 2 days stale.
    // Due-soon: next week starts within 2 days but not yet past grace (matches
    // getOverdueRiders/getDueSoonRiders in lib/rent.ts exactly).
    // Pending-week: at least one full day past the rider's paid-through date —
    // their current payment-cycle week is running unpaid. Paid through today or
    // beyond → hidden until tomorrow. At most one week behind (deeper is
    // Overdue-only); overlaps overdue by design. Amount is one week. Matches
    // getPendingThisWeekRiders.
    const overdueWhere = `rd.days_behind > 2`;
    const dueSoonWhere = `rd.days_behind BETWEEN -1 AND 2`;
    const pendingWeekWhere = `rd.days_behind BETWEEN 1 AND 7`;
    const rentWhere = rent === "overdue" ? overdueWhere : rent === "due_soon" ? dueSoonWhere : pendingWeekWhere;

    const rentSelect = baseSelect.replace(
      `FROM ${schemas.ops}.riders r`,
      `, rd.next_due_date, rd.last_due_date, rd.days_behind, rd.period_days, rd.period_amount, rd.amount_due, rd.overdue_weeks, NULL::numeric AS partial_paid\n    FROM ${schemas.ops}.riders r`
    );
    query = `${rentDueCTE}
    ${rentSelect}
    JOIN rent_due rd ON rd.rider_id = r.id
    WHERE ${rentWhere}
    ORDER BY r.created_at DESC LIMIT ${LIMIT}`;
  } else {
    // Build the shared WHERE (status + hub + free-text q) once, so the page query
    // and the count query stay in sync.
    let where = "WHERE 1=1";
    if (status) { params.push(status); where += ` AND r.status = $${params.length}`; }
    if (hub) { params.push(hub); where += ` AND h.hub_name = $${params.length}`; }
    if (q) {
      // Match name, rider ID, or ANY allotment ID the rider has ever held —
      // server-side so search covers every rider, not just the loaded page.
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      where += ` AND (r.name ILIKE ${p} OR r.rider_code ILIKE ${p} OR EXISTS (
        SELECT 1 FROM ${schemas.ops}.rider_vehicle_assignments a
        WHERE a.rider_id = r.id AND a.allotment_code ILIKE ${p}))`;
    }

    const countRes = await pool.query(
      `SELECT count(*)::int AS n FROM ${schemas.ops}.riders r
       LEFT JOIN ${schemas.ops}.hubs h ON h.id = r.assigned_hub_id ${where}`,
      params
    );
    total = countRes.rows[0]?.n ?? null;

    query = `${baseSelect} ${where} ORDER BY ${sortCol} ${sortDir} NULLS LAST`;
    if (paginated) {
      query += ` LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    } else {
      query += ` LIMIT ${LIMIT}`;
    }
  }

  const result = await pool.query(query, params);
  // Backward-compatible: body is still the rows array; totals ride in headers so
  // existing consumers (mobile) are unaffected.
  const headers: Record<string, string> = {};
  if (total != null) headers["X-Total-Count"] = String(total);
  // Status breakdown over ALL riders (unfiltered) so the overview badges stay
  // accurate no matter which page/filter is shown. Only needed by the paginated
  // dashboard; skip the extra query for the mobile/unpaginated path.
  if (paginated) {
    const sc = await pool.query(
      `SELECT status, count(*)::int AS n FROM ${schemas.ops}.riders GROUP BY status`
    );
    const counts: Record<string, number> = {};
    for (const row of sc.rows) counts[row.status] = row.n;
    headers["X-Status-Counts"] = JSON.stringify(counts);
  }
  return NextResponse.json(result.rows, { headers });
}
