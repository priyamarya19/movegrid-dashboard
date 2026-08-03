import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;

  const { id } = await params;

  const [investor, vehicles, payouts] = await Promise.all([
    pool.query(`
      SELECT ip.*, u.name, u.email, u.mobile
      FROM ${schemas.ops}.investor_profiles ip
      JOIN ${schemas.auth}.users u ON u.id = ip.user_id
      WHERE ip.id = $1
    `, [id]),

    pool.query(`
      SELECT v.id, v.ev_number, v.status,
             m.model_name, m.oem,
             h.hub_name,
             r.name AS assigned_rider, r.id AS rider_id
      FROM ${schemas.ops}.vehicles v
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = v.hub_id
      LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.vehicle_id = v.id AND rva.status = 'active'
      LEFT JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
      WHERE v.investor_id = $1
      ORDER BY v.ev_number
    `, [id]),

    pool.query(`
      SELECT pay.amount, pay.due_date, pay.paid_date, pay.status, pay.period_month, pay.proof_url, v.ev_number
      FROM ${schemas.ops}.investor_payouts pay
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = pay.vehicle_id
      WHERE pay.investor_id = $1
      ORDER BY COALESCE(pay.period_month, pay.due_date) DESC
    `, [id]),
  ]);

  if (!investor.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const totalPaid = payouts.rows.filter((p: { status: string }) => p.status === "paid").reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
  const totalPending = payouts.rows.filter((p: { status: string }) => p.status === "pending").reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);

  // Instalments = distinct months paid; schedule runs off payout_start_date.
  const paidMonths = new Set<string>();
  for (const p of payouts.rows as { status: string; period_month: string | null; due_date: string | null }[]) {
    if (p.status !== "paid") continue;
    const d = p.period_month ?? p.due_date;
    if (d) paidMonths.add(new Date(d).toISOString().slice(0, 7));
  }
  const prof = investor.rows[0];
  const term = Number(prof.payout_term_months ?? 24);
  const instalmentsPaid = paidMonths.size;

  return NextResponse.json({
    investor: prof, vehicles: vehicles.rows, payouts: payouts.rows, totalPaid, totalPending,
    instalments: { paid: instalmentsPaid, term, remaining: Math.max(0, term - instalmentsPaid) },
  });
}

// PATCH /api/investors/[id] — edit the deal terms (admin). Lets existing
// investors (who predate migration 020) get their start date / term / ROI /
// scooter price set.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const b = await req.json();

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  const push = (sql: string, v: string | number | null) => { vals.push(v); sets.push(sql.replace("?", `$${vals.length}`)); };

  if (b.payout_start_date !== undefined) push("payout_start_date = ?", b.payout_start_date || null);
  if (b.payout_term_months !== undefined) {
    const t = Number(b.payout_term_months);
    if (!Number.isInteger(t) || t < 1 || t > 120) return NextResponse.json({ error: "Instalment term must be 1–120 months" }, { status: 400 });
    push("payout_term_months = ?", t);
  }
  if (b.roi_percent !== undefined) push("roi_percent = ?", b.roi_percent === "" || b.roi_percent === null ? null : Number(b.roi_percent));
  if (b.scooter_price !== undefined) push("scooter_price = ?", b.scooter_price === "" || b.scooter_price === null ? null : Number(b.scooter_price));
  if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  vals.push(id);
  const res = await pool.query(
    `UPDATE ${schemas.ops}.investor_profiles SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING id`,
    vals
  );
  if (!res.rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
