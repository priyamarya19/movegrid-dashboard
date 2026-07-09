import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback_secret");

const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  // Cron-triggered report sends: no user session, gated by their own X-Cron-Secret check instead.
  "/api/reports/fleet-status/send",
  "/api/reports/rent-due/send",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Mobile apps authenticate with a Bearer token (no cookie). Honour it so API
  // routes aren't redirected to /login. Route handlers re-check via getSession().
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      await jwtVerify(authHeader.slice(7), secret);
      return NextResponse.next();
    } catch {
      // Fall through to the cookie check / redirect below.
    }
  }

  const token = req.cookies.get("mg_token")?.value;

  if (!token) {
    // API clients should get a 401 (JSON), not an HTML redirect to /login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
