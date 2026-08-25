"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";

type Doc = "aadhaar" | "pan" | "dl";

/**
 * Ops attaching a KYC document that isn't on the record.
 *
 * The rider app is the normal route, but riders who onboard at the hub with
 * their papers in hand often never open it — and until now the page could only
 * offer "verify" on a document with no image behind it. This puts the number
 * and the photos on the record.
 *
 * It deliberately stops there: saving does not mark the document verified. That
 * tick belongs to whoever looked at the original, and is the button next to this
 * one.
 */
export default function KycDocAdd({
  riderId, document, label, hasNumber, hasFront, hasBack, wantsBack,
}: {
  riderId: string;
  document: Doc;
  label: string;
  hasNumber: boolean;
  hasFront: boolean;
  hasBack: boolean;
  /** PAN has no back side, so don't offer one. */
  wantsBack: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [frontKey, setFrontKey] = useState("");
  const [backKey, setBackKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const missing = [!hasNumber && "number", !hasFront && "front photo", wantsBack && !hasBack && "back photo"]
    .filter(Boolean) as string[];
  if (!missing.length) return null;

  const placeholder = document === "aadhaar" ? "12-digit number" : document === "pan" ? "ABCDE1234F" : "DL number";

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/riders/${riderId}/kyc`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, number, front_key: frontKey, back_key: backKey }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Could not save");
        return;
      }
      setOpen(false);
      setNumber(""); setFrontKey(""); setBackKey("");
      router.refresh();
    } catch {
      setError("Could not save — check your connection");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-purple/13 text-accent-purple hover:bg-accent-purple/22 transition-colors"
      >
        + Add {missing.join(" · ")}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 border-t border-subtle pt-2">
      {!hasNumber && (
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-base border border-default rounded-lg px-2.5 py-1.5 text-xs text-primary focus:outline-none focus:border-accent-purple"
        />
      )}
      {!hasFront && (
        <ImageUpload label={`${label} — front`} folder="kyc" value={frontKey} onChange={setFrontKey} />
      )}
      {wantsBack && !hasBack && (
        <ImageUpload label={`${label} — back`} folder="kyc" value={backKey} onChange={setBackKey} />
      )}
      {error ? <p className="text-accent-danger-alt-text text-xs">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || (!number && !frontKey && !backKey)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-purple text-on-dark disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-primary">
          Cancel
        </button>
      </div>
      <p className="text-faint text-[11px] leading-snug">
        Saving records the document. It stays unverified until someone ticks it above.
      </p>
    </div>
  );
}
