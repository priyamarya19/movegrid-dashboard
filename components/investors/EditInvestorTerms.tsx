"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

// Edit the deal terms (admin): earning start date, instalment term, ROI %,
// scooter price — the fields that drive the instalment schedule.
export default function EditInvestorTerms({ investorId, current }: {
  investorId: string;
  current: { payout_start_date: string | null; payout_term_months: number; roi_percent: number | null; scooter_price: number | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    payout_start_date: current.payout_start_date ? current.payout_start_date.slice(0, 10) : "",
    payout_term_months: String(current.payout_term_months ?? 24),
    roi_percent: current.roi_percent != null ? String(current.roi_percent) : "",
    scooter_price: current.scooter_price != null ? String(current.scooter_price) : "",
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/investors/${investorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payout_start_date: form.payout_start_date || null,
        payout_term_months: Number(form.payout_term_months),
        roi_percent: form.roi_percent === "" ? null : Number(form.roi_percent),
        scooter_price: form.scooter_price === "" ? null : Number(form.scooter_price),
      }),
    });
    setSaving(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show(j.error || "Couldn't save terms", "error"); return; }
    toast.show("Deal terms updated", "success");
    setOpen(false);
    router.refresh();
  }

  const inp = "w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-purple";

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-default text-secondary hover:border-accent-purple hover:text-accent-purple transition-colors">
        Edit terms
      </button>
    );
  }
  return (
    <div className="relative inline-block">
      <div className="absolute right-0 top-0 z-50 w-72 p-4 rounded-xl bg-surface border border-strong shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-primary">Deal terms</span>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-secondary text-xs">✕</button>
        </div>
        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Earning start date</label>
          <input type="date" value={form.payout_start_date} onChange={(e) => set("payout_start_date", e.target.value)} className={inp} />
          <p className="text-[10px] text-faint mt-1">1st of the month after deployment</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Instalments</label>
            <input type="number" min="1" max="120" value={form.payout_term_months} onChange={(e) => set("payout_term_months", e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">ROI %</label>
            <input type="number" step="0.1" value={form.roi_percent} onChange={(e) => set("roi_percent", e.target.value)} placeholder="27" className={inp} />
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-muted uppercase tracking-wider mb-1">Scooter price (₹)</label>
          <input type="number" min="0" value={form.scooter_price} onChange={(e) => set("scooter_price", e.target.value)} placeholder="25000" className={inp} />
        </div>
        <button onClick={save} disabled={saving}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-accent-purple text-on-dark disabled:opacity-50">
          {saving ? "Saving…" : "Save terms"}
        </button>
      </div>
    </div>
  );
}
