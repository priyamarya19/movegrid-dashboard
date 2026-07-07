import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;
  const { session } = guard;
  return NextResponse.json({ name: session.name, role: session.role, email: session.email });
}
