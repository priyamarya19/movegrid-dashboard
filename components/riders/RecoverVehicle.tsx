"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";

const REASONS = [
  { key: "non_payment", label: "Non-payment" },
  { key: "absconded", label: "Absconded with vehicle" },
  { key: "unreachable", label: "Rider unreachable" },
  { key: "other", label: "Other (explain in notes)" },
];

// Record a physical vehicle recovery from a defaulting rider. Freezes the
// outstanding as bad debt, closes the tenancy as a recovery (not a return),
// and by default blacklists the rider (untick deliberately).
export default function RecoverVehicle({ riderId, riderName, currentEv }: { riderId: string; riderName: string; currentEv: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("non_payment");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [blacklist, setBlacklist] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (reason === "other" && !notes.trim()) { setError("Notes are required for 'other'"); return; }
    const ok = await confirm({
      title: `Recover ${currentEv} from ${riderName}?`,
      message: `The tenancy closes as a RECOVERY, their outstanding is frozen as recovery dues${blacklist ? ", and the rider is blacklisted" : ""}. This is not a normal return.`,
      confirmLabel: "Record recovery",
      danger: true,
    });
    if (!ok) return;
    setLoading(true); setError("");
    const res = await fetch(`/api/riders/${riderId}/recover-vehicle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, location: location.trim() || null, notes: notes.trim() || null, blacklist }),
    });
    setLoading(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Failed"); return; }
    const d = await res.json();
    setOpen(false);
    toast.show(`Vehicle recovered — ₹${Number(d.outstanding_at_recovery).toLocaleString("en-IN")} frozen as recovery dues`, "success");
    router.refresh();
  }

  const inp = "w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-danger-alt";

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError(""); }}
        className="inline-flex items-center gap-2 border border-default hover:border-accent-danger-alt text-secondary hover:text-accent-danger-alt-text text-sm font-medium px-4 py-2 rounded-xl transition-colors"
      >
        Recover Vehicle
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      <div className="absolute right-0 top-0 z-50 w-80 p-4 rounded-xl bg-surface border border-strong shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-accent-danger-alt-text">Recover {currentEv}</span>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-secondary text-xs">✕</button>
        </div>

        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={inp}>
            {REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Where was it found? (optional)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area / landmark" className={inp} />
        </div>
        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Notes{reason === "other" ? " *" : " (optional)"}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="What happened?" className={`${inp} resize-none`} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={blacklist} onChange={() => setBlacklist((v) => !v)} className="w-3.5 h-3.5 accent-accent-danger-alt" />
          <span className="text-secondary text-xs">Blacklist this rider (blocks login &amp; re-registration)</span>
        </label>

        {error && <p className="text-accent-danger-alt-text text-[11px]">{error}</p>}
        <button onClick={submit} disabled={loading}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-accent-danger-alt text-on-dark disabled:opacity-50 transition-colors">
          {loading ? "Recording…" : "Record Recovery"}
        </button>
        <p className="text-[10px] text-muted">Outstanding is frozen as recovery dues; the vehicle re-enters the fleet via inspection.</p>
      </div>
    </div>
  );
}
