import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole, userHasAppPage, type JWTPayload } from "@/lib/auth";

// Who may reconcile.
//
// Recon is the one section an admin does not get by being an admin. The upload
// is a full bank statement — investor funding, cheque deposits, closing
// balances — so it takes the admin role AND an explicit tick in Settings →
// Users. Fails closed: a new admin sees nothing here until someone grants it.
//
// One rule, used by the page and all three routes, so the tab and the endpoints
// can never disagree about who is allowed in.

export const RECON_PAGE_KEY = "recon";

export async function canRunRecon(userId: string, role: string): Promise<boolean> {
  if (role !== "admin") return false;
  return userHasAppPage(userId, RECON_PAGE_KEY);
}

type Allowed = { session: JWTPayload };
type Denied = { response: NextResponse };

/** Route guard: admin role plus the Recon grant, or a 403. */
export async function requireRecon(req: NextRequest): Promise<Allowed | Denied> {
  const guard = await requireRole(req, ["admin"]);
  if ("response" in guard) return guard;
  if (!(await canRunRecon(guard.session.userId, guard.session.role))) {
    return {
      response: NextResponse.json(
        { error: "Recon access has not been granted to you. An admin can enable it in Settings → Users." },
        { status: 403 }
      ),
    };
  }
  return { session: guard.session };
}

/**
 * Who the finished workbook may be emailed to: every active admin, whether or
 * not they hold the Recon grant.
 *
 * The grant governs who may RUN a reconciliation, not who may read one. A
 * founder who never opens the tool still wants the result in their inbox, and
 * forwarding it by hand is what would otherwise happen.
 *
 * The consequence, stated plainly rather than left implicit: an admin without
 * the grant cannot open the tool but can receive its output by email. That is
 * deliberate. The admin role is still required — a hub in-charge or an ops
 * manager can never be made a recipient.
 */
export async function reconRecipients(ids?: string[]) {
  const params: unknown[] = [];
  let filter = "";
  if (ids?.length) {
    params.push(ids);
    filter = "AND u.id = ANY($1::uuid[])";
  }
  const res = await pool.query(
    `SELECT u.id, u.name, u.email
       FROM ${schemas.auth}.users u
       JOIN ${schemas.auth}.roles r ON r.id = u.role_id
      WHERE r.name = 'admin'
        AND u.status = 'active'
        AND u.email IS NOT NULL
        ${filter}
      ORDER BY u.name`,
    params
  );
  return res.rows as { id: string; name: string | null; email: string }[];
}
