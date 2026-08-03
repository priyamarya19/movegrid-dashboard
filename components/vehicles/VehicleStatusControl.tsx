"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LABEL: Record<string, string> = {
  assigned: "Assigned", returned: "Returned", under_maintenance: "Under Maintenance",
  mechanically_ok: "Mechanically OK", ready_to_deploy: "Ready to Deploy",
  available: "Available", maintenance: "Maintenance",
};
const COLOR: Record<string, string> = {
  assigned: "bg-accent-success/20 text-accent-success-text",
  returned: "bg-accent-danger/20 text-accent-danger-text",
  under_maintenance: "bg-accent-warning/20 text-accent-warning-text",
  mechanically_ok: "bg-accent-purple-2/15 text-accent-purple-2-text",
  ready_to_deploy: "bg-accent-teal/20 text-accent-teal",
};
// Statuses ops can set (assigned/returned are system-driven).
const OPTIONS = ["under_maintenance", "mechanically_ok", "ready_to_deploy"];

// The reason prompt shown when picking a state: mandatory when flagging a
// problem or declaring it fixed, optional for Ready to Deploy. Every change
// lands in the vehicle's history timeline with this text.
const REASON_PROMPT: Record<string, { label: string; required: boolean; placeholder: string }> = {
  under_maintenance: { label: "What's the issue?", required: true, placeholder: "e.g. Battery not charging" },
  mechanically_ok: { label: "What was checked/fixed?", required: true, placeholder: "e.g. Cell replaced, road-tested" },
  ready_to_deploy: { label: "Note (optional)", required: false, placeholder: "e.g. Cleaned & charged" },
};

export default function VehicleStatusControl({ vehicleId, status, canEdit }: { vehicleId: string; status: string; canEdit: boolean }) {
  const router = useRouter();
  const [cur, setCur] = useState(status);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<string | null>(null); // status awaiting its reason
  const [reason, setReason] = useState("");
  const assigned = cur === "assigned";

  async function submit() {
    if (!pending) return;
    const cfg = REASON_PROMPT[pending];
    if (cfg.required && !reason.trim()) { setErr(cfg.label); return; }
    setSaving(true); setErr("");
    const r = await fetch(`/api/vehicles/${vehicleId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: pending, reason: reason.trim() || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setErr(j.error || "Failed to update status"); return; }
    setCur(pending); setPending(null); setReason(""); router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${COLOR[cur] ?? "bg-muted/20 text-muted"}`}>{LABEL[cur] ?? cur}</span>
      {canEdit && (assigned ? (
        <span className="text-[11px] text-muted">🔒 Status locked while assigned</span>
      ) : pending ? (
        <div className="flex flex-col items-end gap-1.5 w-64">
          <span className="text-[11px] text-secondary font-semibold">→ {LABEL[pending]}: {REASON_PROMPT[pending].label}{REASON_PROMPT[pending].required ? " *" : ""}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
            placeholder={REASON_PROMPT[pending].placeholder}
            className="w-full bg-base border border-default rounded-lg px-2.5 py-1.5 text-primary text-xs focus:outline-none focus:border-accent-teal" />
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving}
              className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-accent-teal text-on-dark disabled:opacity-50">
              {saving ? "Saving…" : "Confirm"}
            </button>
            <button onClick={() => { setPending(null); setReason(""); setErr(""); }} className="text-[11px] text-muted hover:text-primary">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 justify-end">
          {OPTIONS.map((o) => (
            <button key={o} disabled={saving || o === cur} onClick={() => { setPending(o); setReason(""); setErr(""); }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-50 ${o === cur ? "border-accent-teal text-accent-teal" : "border-strong text-secondary hover:border-strong hover:text-primary"}`}>
              {LABEL[o]}
            </button>
          ))}
        </div>
      ))}
      {err && <span className="text-[11px] text-accent-danger-alt-text max-w-[220px] text-right">{err}</span>}
    </div>
  );
}
