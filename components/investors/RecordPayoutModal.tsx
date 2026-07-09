"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";

type VehicleOption = { id: string; ev_number: string };

type Props = {
  investorId: string;
  vehicles: VehicleOption[];
};

const inp = "w-full bg-base border border-default rounded-xl px-3 py-2.5 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-teal transition-colors";

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function RecordPayoutModal({ investorId, vehicles }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    period_month: thisMonth(),
    amount: "",
    paid_date: new Date().toISOString().slice(0, 10),
    vehicle_id: "",
    proof_url: "",
    note: "",
  });

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  function reset() {
    setForm({ period_month: thisMonth(), amount: "", paid_date: new Date().toISOString().slice(0, 10), vehicle_id: "", proof_url: "", note: "" });
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.proof_url) { setError("Please attach the payment proof"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/investors/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investor_id: investorId, ...form, amount: Number(form.amount), vehicle_id: form.vehicle_id || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to record payout"); return; }
      setOpen(false);
      reset();
      router.refresh();
    } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg bg-accent-teal hover:bg-accent-teal text-on-dark text-xs font-semibold transition-colors">
        + Record Payout
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative bg-surface border border-default rounded-2xl w-full max-w-md max-h-[88vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-default flex items-center justify-between sticky top-0 bg-surface">
          <h2 className="text-primary font-semibold">Record Payout</h2>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-primary">✕</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Month <span className="text-accent-danger-alt-text">*</span></label>
              <input type="month" className={inp} value={form.period_month} onChange={(e) => set("period_month", e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Amount (₹) <span className="text-accent-danger-alt-text">*</span></label>
              <input type="number" min="1" className={inp} value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="12000" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Paid Date</label>
              <input type="date" className={inp} value={form.paid_date} onChange={(e) => set("paid_date", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Vehicle (optional)</label>
              <select className={inp} value={form.vehicle_id} onChange={(e) => set("vehicle_id", e.target.value)}>
                <option value="">All / general</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.ev_number}</option>)}
              </select>
            </div>
          </div>

          <ImageUpload label="Payment Proof *" folder="investor-payouts" value={form.proof_url} onChange={(key) => set("proof_url", key)} />

          <div>
            <label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Note (optional)</label>
            <input className={inp} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. UPI ref / remarks" />
          </div>

          {error && <p className="text-accent-danger-alt-text text-sm">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="px-5 py-2 rounded-lg bg-accent-teal hover:bg-accent-teal text-on-dark text-sm font-semibold disabled:opacity-60 transition-colors">
              {saving ? "Saving…" : "Record Payout"}
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg border border-default text-muted hover:text-primary text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
