import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

const ACTIONS = ["rider_edit", "allotment_start_date"] as const;

// Who may approve what. Admin-only: letting anyone edit the list of people who
// can authorise changes would defeat the point of having a list.
export async function GET(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;

  const res = await pool.query(
    `SELECT u.id, u.name, u.email, r.name AS role,
            COALESCE(a.actions, ARRAY[]::text[]) AS actions
       FROM ${schemas.auth}.users u
       LEFT JOIN ${schemas.auth}.roles r ON r.id = u.role_id
       LEFT JOIN ${schemas.ops}.approval_approvers a ON a.user_id = u.id
      -- Admins only. The point of the gate is that ops cannot wave their own
      -- change through, so ops managers, hub incharges and investors are not
      -- offered here. Anyone already configured stays listed whatever their
      -- role, so an approver can never be hidden from this screen.
      WHERE u.status = 'active' AND (r.name = 'admin' OR a.user_id IS NOT NULL)
      ORDER BY (a.user_id IS NULL), u.name`
  );
  return NextResponse.json({ users: res.rows, actions: ACTIONS });
}

export async function PUT(req: NextRequest) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const b = await req.json().catch(() => ({}));
  const userId = String(b.user_id ?? "");
  const actions = Array.isArray(b.actions) ? b.actions.filter((a: string) => ACTIONS.includes(a as never)) : [];
  if (!userId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

  if (!actions.length) {
    // Removing the last approver would silently block every gated action, since
    // an empty approver list is a hard stop by design. Refuse instead.
    const others = await pool.query(
      `SELECT count(*)::int AS n FROM ${schemas.ops}.approval_approvers WHERE user_id <> $1`, [userId]
    );
    if (others.rows[0].n === 0) {
      return NextResponse.json(
        { error: "At least one approver must remain — otherwise nothing can be approved at all" },
        { status: 400 }
      );
    }
    await pool.query(`DELETE FROM ${schemas.ops}.approval_approvers WHERE user_id = $1`, [userId]);
  } else {
    await pool.query(
      `INSERT INTO ${schemas.ops}.approval_approvers (user_id, actions, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET actions = EXCLUDED.actions`,
      [userId, actions, session.name]
    );
  }

  await writeAudit({
    action: "approval_approvers_changed", entity: "user", entityId: userId,
    actorId: session.userId, actorName: session.name, req, details: { actions },
  });
  return NextResponse.json({ ok: true });
}
