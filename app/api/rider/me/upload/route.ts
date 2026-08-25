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

// Support tickets may carry a short clip — a rattling wheel or a dead display
// is far easier to show than to describe, especially for a rider typing in a
// second language. Images only everywhere else.
const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};
const MAX_BYTES = 15 * 1024 * 1024;
// A 10-second clip off a mid-range Android lands around 10-20 MB.
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const guard = await requireRider(req);
  if ("response" in guard) return guard.response;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Purpose-scoped prefixes only — a rider upload can never land elsewhere.
  const rawPurpose = formData.get("purpose");
  const purpose =
    rawPurpose === "kyc" ? "rider-kyc" : rawPurpose === "ticket" ? "rider-tickets" : "rider-claims";
  const videoAllowed = purpose === "rider-tickets";

  const contentType = (file.type || "").toLowerCase();
  const isVideo = videoAllowed && contentType in ALLOWED_VIDEO_TYPES;
  const ext = isVideo ? ALLOWED_VIDEO_TYPES[contentType] : ALLOWED_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      {
        error: videoAllowed
          ? "Upload a JPG, PNG, WEBP or HEIC image, or an MP4/MOV video"
          : "Upload a JPG, PNG, WEBP or HEIC image",
      },
      { status: 415 }
    );
  }
  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_BYTES;
  if (file.size > limit) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${Math.round(limit / (1024 * 1024))} MB.` },
      { status: 413 }
    );
  }

  const key = `${purpose}/${guard.rider.riderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Body: Buffer.from(await file.arrayBuffer()),
    ContentType: contentType,
  }));

  return NextResponse.json({ key });
}
