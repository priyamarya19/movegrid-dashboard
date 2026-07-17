import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard.response;
  const { session } = guard;

  const { id } = await params;
  const body = await req.json();

  // Last-admin lockout guard: an admin must not be able to strip their own admin
  // role, or deactivate themselves, if they are the last remaining active admin.
  const isSelf = id === session.userId;
  const demotingSelf = isSelf && body.role !== undefined && body.role !== "admin";
  const deactivatingSelf = isSelf && body.status !== undefined && body.status !== "active";
  if (demotingSelf || deactivatingSelf) {
    const adminCount = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM ${schemas.auth}.users u
       JOIN ${schemas.auth}.roles r ON r.id = u.role_id
       WHERE r.name = 'admin' AND u.status = 'active'`
    );
    if ((adminCount.rows[0]?.n ?? 0) <= 1) {
      return NextResponse.json(
        { error: "You are the last active admin; you cannot remove your own admin access." },
        { status: 400 }
      );
    }
  }

  // A role or status change must revoke the user's existing tokens immediately
  // (bump token_version — see isSessionCurrent in lib/auth): otherwise a demoted
  // or suspended user keeps their old access until the 8h token expiry.
  let revoke = false;

  if (body.role !== undefined) {
    const roleResult = await pool.query(
      `SELECT id FROM ${schemas.auth}.roles WHERE name = $1`,
      [body.role]
    );
    if (!roleResult.rows[0]) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    await pool.query(
      `UPDATE ${schemas.auth}.users SET role_id = $1 WHERE id = $2`,
      [roleResult.rows[0].id, id]
    );
    revoke = true;
  }

  if (body.status !== undefined) {
    const validStatuses = ["active", "inactive", "suspended"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await pool.query(
      `UPDATE ${schemas.auth}.users SET status = $1 WHERE id = $2`,
      [body.status, id]
    );
    revoke = true;
  }

  if (revoke) {
    await pool.query(
      `UPDATE ${schemas.auth}.users SET token_version = token_version + 1 WHERE id = $1`,
      [id]
    );
    await writeAudit({
      action: body.status !== undefined ? "user_status_changed" : "user_role_changed",
      entity: "user", entityId: id, actorId: session.userId, actorName: session.name, req,
      details: { role: body.role ?? undefined, status: body.status ?? undefined },
    });
  }

  // Editable profile fields (name / email / mobile). These don't affect access,
  // so no token revoke. Built dynamically so any subset can be sent.
  const profileSets: string[] = [];
  const profileVals: unknown[] = [];
  if (body.name !== undefined) {
    if (!String(body.name).trim()) return NextResponse.json({ error: "Name is required", field: "name" }, { status: 400 });
    profileVals.push(String(body.name).trim()); profileSets.push(`name = $${profileVals.length}`);
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email", field: "email" }, { status: 400 });
    profileVals.push(email); profileSets.push(`email = $${profileVals.length}`);
  }
  if (body.mobile !== undefined) {
    if (!String(body.mobile).trim()) return NextResponse.json({ error: "Mobile is required", field: "mobile" }, { status: 400 });
    profileVals.push(String(body.mobile).trim()); profileSets.push(`mobile = $${profileVals.length}`);
  }
  if (profileSets.length) {
    profileVals.push(id);
    try {
      await pool.query(`UPDATE ${schemas.auth}.users SET ${profileSets.join(", ")} WHERE id = $${profileVals.length}`, profileVals);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "That email is already in use", field: "email" }, { status: 409 });
      }
      throw e;
    }
    await writeAudit({
      action: "user_profile_updated", entity: "user", entityId: id,
      actorId: session.userId, actorName: session.name, req,
      details: { fields: profileSets.map((s) => s.split(" ")[0]) },
    });
  }

  // A configurable per-user permission, independent of role — who can approve a
  // pending rent waiver request (see app/api/rent-waivers).
  if (body.can_approve_rent_waivers !== undefined) {
    await pool.query(
      `UPDATE ${schemas.auth}.users SET can_approve_rent_waivers = $1 WHERE id = $2`,
      [body.can_approve_rent_waivers === true, id]
    );
  }

  // Per-user permission gating the Allotments list (migration 012).
  if (body.can_view_allotments !== undefined) {
    await pool.query(
      `UPDATE ${schemas.auth}.users SET can_view_allotments = $1 WHERE id = $2`,
      [body.can_view_allotments === true, id]
    );
    await writeAudit({
      action: "user_permission_changed", entity: "user", entityId: id,
      actorId: session.userId, actorName: session.name, req,
      details: { can_view_allotments: body.can_view_allotments === true },
    });
  }

  return NextResponse.json({ ok: true });
}
