import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireSession, DATA_ROLES } from "@/lib/auth";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Folders an investor session is allowed to presign. Ops roles (DATA_ROLES) may
// read any key; an investor must never be able to fetch a rider's KYC/photos/
// payment proofs, so they're limited to investor-facing folders (their payout
// proof lives under investor-payouts/). Keys are `{folder}/{file}` — see
// app/api/upload/route.ts.
const INVESTOR_FOLDERS = new Set(["investor-payouts", "investor-aadhaar"]);

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "No key" }, { status: 400 });

  // A non-ops (investor) session may only presign keys under an allowed folder.
  if (!DATA_ROLES.includes(guard.session.role as (typeof DATA_ROLES)[number])) {
    const folder = key.split("/")[0];
    if (!INVESTOR_FOLDERS.has(folder)) {
      return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    }
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    { expiresIn: 3600 }
  );

  return NextResponse.redirect(url);
}
