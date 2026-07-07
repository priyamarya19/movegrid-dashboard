import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback_secret");

export type JWTPayload = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

// Why a token failed to resolve to a session:
//  - "ok":      valid session
//  - "missing": no Bearer token and no cookie was presented
//  - "expired": a token was presented but has expired (jose ERR_JWT_EXPIRED)
//  - "invalid": a token was presented but is otherwise malformed/unverifiable
export type AuthReason = "ok" | "missing" | "expired" | "invalid";

export type AuthResult = {
  session: JWTPayload | null;
  reason: AuthReason;
};

export const DATA_ROLES = ["admin", "ops_manager", "hub_incharge"] as const;

export async function signToken(payload: JWTPayload) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
}

// Verify a token, distinguishing an expired token from an otherwise-invalid one.
async function verifyTokenResult(token: string): Promise<AuthResult> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return { session: payload as unknown as JWTPayload, reason: "ok" };
  } catch (err) {
    // jose 6.x throws JWTExpired (code 'ERR_JWT_EXPIRED') for an expired token.
    if (err instanceof joseErrors.JWTExpired || (err as { code?: string })?.code === "ERR_JWT_EXPIRED") {
      return { session: null, reason: "expired" };
    }
    return { session: null, reason: "invalid" };
  }
}

// Backward-compatible: collapses any failure to null.
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  return (await verifyTokenResult(token)).session;
}

// Resolve the session AND why it failed, so callers can emit the right auth code.
// Bearer token (mobile) is checked first, then the mg_token cookie (web).
export async function getAuth(req?: NextRequest): Promise<AuthResult> {
  if (req) {
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();
      if (!token) return { session: null, reason: "missing" };
      return verifyTokenResult(token);
    }
  }
  const cookieStore = await cookies();
  const token = cookieStore.get("mg_token")?.value;
  if (!token) return { session: null, reason: "missing" };
  return verifyTokenResult(token);
}

// Backward-compatible session accessor used by existing routes.
export async function getSession(req?: NextRequest): Promise<JWTPayload | null> {
  return (await getAuth(req)).session;
}

// Standardized 401 auth-failure response. An expired token gets code
// "token_expired" (the app uses this to force a logout); a missing/malformed
// token gets code "unauthorized".
export function unauthorizedResponse(reason: AuthReason) {
  const expired = reason === "expired";
  return NextResponse.json(
    {
      error: expired ? "Session expired" : "Authentication required",
      code: expired ? "token_expired" : "unauthorized",
    },
    { status: 401 }
  );
}

// Standardized 403 response for a valid session with an insufficient role.
// This is NOT an auth failure — the app must not log out on it.
export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
}

// Guard helper: require a valid session whose role is in `roles`.
// Returns `{ session }` on success, or `{ response }` (an already-built 401/403)
// on failure. Routes: `const g = await requireRole(req); if ("response" in g) return g.response;`
export async function requireRole(
  req: NextRequest,
  roles: readonly string[] = DATA_ROLES
): Promise<{ session: JWTPayload } | { response: NextResponse }> {
  const { session, reason } = await getAuth(req);
  if (!session) return { response: unauthorizedResponse(reason) };
  if (!roles.includes(session.role)) return { response: forbiddenResponse() };
  return { session };
}

// Guard helper: require only a valid session (any role).
export async function requireSession(
  req: NextRequest
): Promise<{ session: JWTPayload } | { response: NextResponse }> {
  const { session, reason } = await getAuth(req);
  if (!session) return { response: unauthorizedResponse(reason) };
  return { session };
}
