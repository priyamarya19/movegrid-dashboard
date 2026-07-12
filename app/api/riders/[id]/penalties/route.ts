import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { beginIdempotency, finishIdempotency, abortIdempotency } from "@/lib/idempotency";

// GET /api/riders/[id]/penalties — a rider's penalties (newest first), with the vehicle each was raised on.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const res = await pool.query(
    `SELECT p.id, p.amount, p.detail, p.status, p.created_by, p.created_at, v.ev_number,
            p.payment_mode, p.payment_utr, p.payment_proof_url
       FROM ${schemas.ops}.rider_penalties p
       LEFT JOIN ${schemas.ops}.vehicles v ON v.id = p.vehicle_id
      WHERE p.rider_id = $1
      ORDER BY p.created_at DESC`,
    [id]
  );
  return NextResponse.json({ penalties: res.rows });
}

// POST /api/riders/[id]/penalties — add an ad-hoc penalty. vehicle_id/assignment_id are a frozen
// snapshot of the rider's CURRENT active vehicle at this moment (never updated afterwards).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const session = guard.session;
  const { id } = await params;
  const { detail, amount } = await req.json();

  const hasAmount = amount != null && amount !== "";
  if (!detail && !hasAmount) {
    return NextResponse.json({ error: "A penalty detail or amount is required" }, { status: 400 });
  }

  // Dedupe a retried submission (same Idempotency-Key) so it can't create two
  // penalty rows for one action.
  const idem = await beginIdempotency(req, "penalty-create", session.userId);
  if (idem.mode === "replay") return idem.response;

  try {
    const cur = await pool.query(
      `SELECT id, vehicle_id FROM ${schemas.ops}.rider_vehicle_assignments
        WHERE rider_id = $1 AND status = 'active' ORDER BY assigned_date DESC LIMIT 1`,
      [id]
    );
    const a = cur.rows[0];

    const res = await pool.query(
      `INSERT INTO ${schemas.ops}.rider_penalties (rider_id, vehicle_id, assignment_id, amount, detail, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
      [id, a?.vehicle_id ?? null, a?.id ?? null, hasAmount ? Number(amount) : null, detail || null, session.name]
    );
    const respBody = { id: res.rows[0].id };
    if (idem.mode === "claimed") await finishIdempotency(idem, 201, respBody);
    return NextResponse.json(respBody, { status: 201 });
  } catch (e) {
    if (idem.mode === "claimed") await abortIdempotency(idem);
    throw e;
  }
}

// PATCH /api/riders/[id]/penalties — mark a penalty paid (proof required) or waived.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const { penalty_id, action, payment_mode, payment_utr, payment_proof_url } = await req.json();
  if (!penalty_id || !["pay", "waive"].includes(action)) {
    return NextResponse.json({ error: "penalty_id and a valid action are required" }, { status: 400 });
  }
  if (action === "pay" && (!payment_mode || !payment_proof_url)) {
    return NextResponse.json({ error: "Payment mode and a proof image are required to mark paid" }, { status: 400 });
  }
  const upd = action === "waive"
    ? await pool.query(`UPDATE ${schemas.ops}.rider_penalties SET status='waived' WHERE id=$1 AND rider_id=$2`, [penalty_id, id])
    : await pool.query(
        `UPDATE ${schemas.ops}.rider_penalties SET status='paid', payment_mode=$1, payment_utr=$2, payment_proof_url=$3, paid_at=now() WHERE id=$4 AND rider_id=$5`,
        [payment_mode, payment_utr || null, payment_proof_url, penalty_id, id]
      );
  // Report a miss instead of a false success when no penalty matched (wrong id,
  // or it belongs to another rider).
  if (upd.rowCount === 0) {
    return NextResponse.json({ error: "Penalty not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
