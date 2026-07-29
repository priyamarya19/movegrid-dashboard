import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireRider } from "@/lib/riderAuth";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Rider-app uploads (payment screenshots; later KYC). Images only — riders never
// upload PDFs — and always into the rider-claims/ prefix regardless of what the
// client sends, so a rider upload can't land anywhere else in the bucket.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const contentType = (file.type || "").toLowerCase();
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) return NextResponse.json({ error: "Upload a JPG, PNG, WEBP or HEIC image" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large. Maximum size is 15 MB." }, { status: 413 });

  const key = `rider-claims/${guard.rider.riderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Body: Buffer.from(await file.arrayBuffer()),
    ContentType: contentType,
  }));

  return NextResponse.json({ key });
}
