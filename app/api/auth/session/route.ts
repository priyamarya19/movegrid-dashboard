import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });
  return NextResponse.json({ name: session.name, role: session.role, email: session.email });
}
