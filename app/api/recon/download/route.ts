import { NextRequest, NextResponse } from "next/server";
import { requireRecon } from "@/lib/reconAccess";
import { getRun } from "@/lib/reconCache";

// GET /api/recon/download?token=… — the workbook from a run held in memory.
// The token alone is not a grant: the run is only returned to the admin who
// created it.
export async function GET(req: NextRequest) {
  const guard = await requireRecon(req);
  if ("response" in guard) return guard.response;

  const token = req.nextUrl.searchParams.get("token") ?? "";
  const run = getRun(token, guard.session.userId);
  if (!run) {
    return NextResponse.json(
      { error: "That reconciliation has expired. Run it again — results are kept for a few minutes only." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(run.workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${run.filename}"`,
      "Content-Length": String(run.workbook.length),
      "Cache-Control": "no-store",
    },
  });
}
