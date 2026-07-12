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

export default function VehicleStatusControl({ vehicleId, status, canEdit }: { vehicleId: string; status: string; canEdit: boolean }) {
  const router = useRouter();
  const [cur, setCur] = useState(status);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const assigned = cur === "assigned";

  async function setStatus(s: string) {
    setSaving(true); setErr("");
    const r = await fetch(`/api/vehicles/${vehicleId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }),
    });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setErr(j.error || "Failed to update status"); return; }
    setCur(s); router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${COLOR[cur] ?? "bg-muted/20 text-muted"}`}>{LABEL[cur] ?? cur}</span>
      {canEdit && (assigned ? (
        <span className="text-[11px] text-muted">🔒 Status locked while assigned</span>
      ) : (
        <div className="flex flex-wrap gap-1.5 justify-end">
          {OPTIONS.map((o) => (
            <button key={o} disabled={saving || o === cur} onClick={() => setStatus(o)}
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
