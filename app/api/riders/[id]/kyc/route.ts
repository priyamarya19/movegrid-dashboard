import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { requireRole } from "@/lib/auth";
import { convertRiderLeadByMobile } from "@/lib/leadConvert";
import { pushToRiderAsync } from "@/lib/riderPush";
import { writeAudit } from "@/lib/audit";

const validDocs = ["aadhaar", "pan", "dl"] as const;
type Doc = typeof validDocs[number];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Null session -> 401 (auth contract); valid session, wrong role -> 403.
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const { id } = await params;
  const { document, verified } = await req.json() as { document: Doc; verified: boolean };

  if (!validDocs.includes(document)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }

  const verifiedByCol = `${document}_verified_by`;
  const verifiedAtCol = `${document}_verified_at`;
  const verifiedCol = `${document}_verified`;

  const upd = await pool.query(
    `UPDATE ${schemas.ops}.riders
     SET ${verifiedCol} = $1,
         ${verifiedByCol} = $2,
         ${verifiedAtCol} = $3
     WHERE id = $4
     RETURNING mobile`,
    [verified, verified ? session.name : null, verified ? new Date() : null, id]
  );

  // Team verifying documents also counts as "KYC completed" → convert any
  // matching rider lead.
  if (verified && upd.rows[0]?.mobile) await convertRiderLeadByMobile(upd.rows[0].mobile);

  // Tell the rider once their Aadhaar clears — that is the document that lets
  // them collect a scooter. PAN/DL only matter for high-speed, and firing on
  // each tick would mean three notifications for one piece of good news.
  if (verified && document === "aadhaar") pushToRiderAsync(id, "kyc_verified");

  return NextResponse.json({ ok: true, verified, verified_by: verified ? session.name : null });
}

// PUT — ops attaching the documents themselves.
//
// KYC is normally the rider's job in the app, but plenty of riders onboard at
// the hub with the papers in hand and never touch the app: before this, ops
// could only tick "verified" on a document that had no image behind it. Now
// they can put the number and the photos on the record first.
//
// Deliberately does NOT set the verified flag — attaching a document and
// attesting to it are two different acts, and the second one belongs to whoever
// checks the original.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(req, ["admin", "ops_manager", "hub_incharge"]);
  if ("response" in guard) return guard.response;
  const session = guard.session;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const document = b.document as Doc;
  if (!validDocs.includes(document)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const number = str(b.number);
  const frontKey = str(b.front_key);
  const backKey = str(b.back_key);

  // Same rules the rider app applies, so a document added by ops is held to the
  // standard the rider would have been.
  if (document === "aadhaar" && number && !/^\d{12}$/.test(number.replace(/\s/g, ""))) {
    return NextResponse.json({ error: "Aadhaar must be 12 digits" }, { status: 400 });
  }
  if (document === "pan" && number && !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(number)) {
    return NextResponse.json({ error: "PAN looks like ABCDE1234F" }, { status: 400 });
  }
  if (document === "dl" && number && number.length < 8) {
    return NextResponse.json({ error: "A DL number is at least 8 characters" }, { status: 400 });
  }
  if (!number && !frontKey && !backKey) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  }

  const numberCol = document === "aadhaar" ? "aadhaar" : document === "pan" ? "pan" : "dl_number";
  const frontCol = document === "aadhaar" ? "aadhaar_front_url" : document === "pan" ? "pan_image_url" : "dl_front_url";
  const backCol = document === "aadhaar" ? "aadhaar_back_url" : document === "dl" ? "dl_back_url" : null;

  // COALESCE on NULLIF: a field left blank in the form must not wipe what is
  // already on the record.
  const sets = [`${numberCol} = COALESCE(NULLIF($1,''), ${numberCol})`,
                `${frontCol} = COALESCE(NULLIF($2,''), ${frontCol})`];
  const values: (string | null)[] = [document === "aadhaar" ? number.replace(/\s/g, "") : number.toUpperCase(), frontKey];
  if (backCol) {
    sets.push(`${backCol} = COALESCE(NULLIF($${values.length + 1},''), ${backCol})`);
    values.push(backKey);
  }

  const res = await pool.query(
    `UPDATE ${schemas.ops}.riders SET ${sets.join(", ")} WHERE id = $${values.length + 1} RETURNING mobile`,
    [...values, id]
  );
  if (!res.rows[0]) return NextResponse.json({ error: "Rider not found" }, { status: 404 });

  await writeAudit({
    action: "rider_kyc_document_added",
    entity: "rider",
    entityId: id,
    actorId: session.userId,
    actorName: session.name,
    req,
    details: { document, has_number: !!number, has_front: !!frontKey, has_back: !!backKey },
  });

  return NextResponse.json({ ok: true });
}
