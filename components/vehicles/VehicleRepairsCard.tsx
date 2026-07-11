"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Repair = {
  id: string;
  part_name: string | null;
  amount: number;
  repair_date: string | null;
  payment_mode: string | null;
  payment_reference: string | null;
  notes: string | null;
  rider_id: string | null;
  rider_name: string | null;
  rider_name_raw: string | null;
};

type Props = {
  vehicleId: string;
  repairs: Repair[];
  canEdit: boolean;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function VehicleRepairsCard({ vehicleId, repairs, canEdit }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    part_name: "", amount: "", repair_date: "", payment_mode: "", payment_reference: "", notes: "",
  });

  async function save() {
    if (!form.amount) { setError("Amount is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/vehicle-repairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          part_name: form.part_name || null,
          amount: Number(form.amount),
          repair_date: form.repair_date || null,
          payment_mode: form.payment_mode || null,
          payment_reference: form.payment_reference || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save"); return; }
      setForm({ part_name: "", amount: "", repair_date: "", payment_mode: "", payment_reference: "", notes: "" });
      setAdding(false);
      router.refresh();
    } finally { setSaving(false); }
  }

  const total = repairs.reduce((s, r) => s + Number(r.amount), 0);
  const inputCls = "w-full bg-base border border-default rounded-lg px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-teal";

  return (
    <div className="bg-surface border border-default rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-default flex items-center justify-between">
        <div>
          <h2 className="text-primary font-semibold">Repair History</h2>
          {repairs.length > 0 && <p className="text-muted text-xs mt-0.5">₹{total.toLocaleString()} total across {repairs.length} record{repairs.length === 1 ? "" : "s"}</p>}
        </div>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-accent-teal hover:underline">
            + Add Repair
          </button>
        )}
      </div>

      {adding && (
        <div className="px-5 py-4 border-b border-default space-y-3 bg-surface-alt">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Part name" value={form.part_name} onChange={(e) => setForm({ ...form, part_name: e.target.value })} className={inputCls} />
            <input placeholder="Amount (₹)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
            <input placeholder="Repair date" type="date" value={form.repair_date} onChange={(e) => setForm({ ...form, repair_date: e.target.value })} className={inputCls} />
            <input placeholder="Payment mode (Online/Cash/Pending)" value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })} className={inputCls} />
            <input placeholder="Payment reference / UTR" value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} className={inputCls} />
            <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </div>
          {error && <p className="text-accent-danger-alt-text text-xs">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-accent-teal hover:bg-accent-teal text-on-dark text-xs font-semibold disabled:opacity-60 transition-colors">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => { setAdding(false); setError(""); }}
              className="px-3 py-1.5 rounded-lg border border-default text-muted hover:text-primary text-xs transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead>
          <tr className="border-b border-default">
            {["Date", "Rider", "Part", "Amount", "Payment"].map((h) => (
              <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {repairs.length === 0 ? (
            <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">No repairs recorded</td></tr>
          ) : repairs.map((r) => (
            <tr key={r.id} className="border-b border-subtle">
              <td className="px-5 py-3 text-secondary text-xs">{fmtDate(r.repair_date)}</td>
              <td className="px-5 py-3">
                {r.rider_id ? (
                  <Link href={`/riders/${r.rider_id}`} className="text-accent-purple hover:underline text-xs">{r.rider_name}</Link>
                ) : (
                  <span className="text-muted text-xs">{r.rider_name_raw ?? "—"}</span>
                )}
              </td>
              <td className="px-5 py-3 text-secondary text-xs">{r.part_name ?? "—"}</td>
              <td className="px-5 py-3 text-accent-teal font-semibold">₹{Number(r.amount).toLocaleString()}</td>
              <td className="px-5 py-3 text-secondary text-xs">
                {r.payment_mode ?? "—"}
                {r.payment_reference && <span className="text-muted block text-[11px]">{r.payment_reference}</span>}
                {r.notes && <span className="text-muted block text-[11px]">{r.notes}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
