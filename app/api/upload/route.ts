import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSession } from "@/lib/auth";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Allowed upload types → canonical, server-derived file extension. We do NOT
// trust the client-supplied filename for the extension. PDFs are allowed because
// KYC documents (and the ImageUpload component: accept="image/*,application/pdf")
// legitimately upload them.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB cap

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "misc";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const contentType = (file.type || "").toLowerCase();
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a JPG, PNG, WEBP, HEIC image or a PDF." },
      { status: 415 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_BYTES / (1024 * 1024)} MB.` },
      { status: 413 }
    );
  }

  // Sanitise folder to a safe path segment to avoid key traversal / injection.
  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "misc";
  const key = `${safeFolder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return NextResponse.json({ key });
}
