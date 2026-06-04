import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback_secret");

export type JWTPayload = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

export async function signToken(payload: JWTPayload) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getSession(req?: NextRequest): Promise<JWTPayload | null> {
  // Check Bearer token first (mobile apps)
  if (req) {
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      return verifyToken(token);
    }
  }
  // Fall back to cookie (web dashboard)
  const cookieStore = await cookies();
  const token = cookieStore.get("mg_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}
