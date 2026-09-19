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
 * Admins who hold the Recon grant — the only people the workbook may be sent
 * to. Restricting recipients to the same list means the email cannot put the
 * bank statement in front of someone who is not allowed to open it in the app.
 */
export async function reconRecipients(ids?: string[]) {
  const params: unknown[] = [RECON_PAGE_KEY];
  let filter = "";
  if (ids?.length) {
    params.push(ids);
    filter = "AND u.id = ANY($2::uuid[])";
  }
  const res = await pool.query(
    `SELECT u.id, u.name, u.email
       FROM ${schemas.auth}.users u
       JOIN ${schemas.auth}.roles r ON r.id = u.role_id
      WHERE r.name = 'admin'
        AND u.status = 'active'
        AND u.email IS NOT NULL
        AND u.app_pages @> ARRAY[$1]::text[]
        ${filter}
      ORDER BY u.name`,
    params
  );
  return res.rows as { id: string; name: string | null; email: string }[];
}
