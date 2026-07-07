"use client";

import { useState, useEffect, useCallback } from "react";

type Penalty = {
  id: string; amount: number | null; detail: string | null; status: string;
  created_by: string | null; created_at: string; ev_number: string | null;
};

export default function RiderPenalties({ riderId }: { riderId: string }) {
  const [rows, setRows] = useState<Penalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/riders/${riderId}/penalties`);
    if (res.ok) setRows((await res.json()).penalties);
    setLoading(false);
  }, [riderId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!detail && !amount) { setError("Enter a detail or amount"); return; }
    setAdding(true); setError("");
    const res = await fetch(`/api/riders/${riderId}/penalties`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detail: detail || null, amount: amount || null }),
    });
    setAdding(false);
    if (!res.ok) { setError((await res.json()).error || "Failed to add"); return; }
    setDetail(""); setAmount(""); setOpen(false); load();
  }

  const outstanding = rows.filter(r => r.status !== "waived").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const fmtD = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold">Penalties</h2>
          {outstanding > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-semibold">
              ₹{outstanding.toLocaleString("en-IN")} outstanding
            </span>
          )}
        </div>
        <button onClick={() => setOpen(o => !o)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#e1705520] text-[#e17055] hover:bg-[#e1705530] transition-colors">
          {open ? "Cancel" : "+ Add penalty"}
        </button>
      </div>

      {open && (
        <div className="px-5 py-4 border-b border-[#1e1e2e] bg-[#0d0d14] flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-[#555] uppercase tracking-wider mb-1">Detail</label>
            <input value={detail} onChange={e => setDetail(e.target.value)} placeholder="e.g. Front fender, handle T band"
              className="w-full bg-[#0A0A0F] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#e17055]" />
          </div>
          <div className="w-28">
            <label className="block text-[11px] text-[#555] uppercase tracking-wider mb-1">Amount ₹</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
              className="w-full bg-[#0A0A0F] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#e17055]" />
          </div>
          <button onClick={add} disabled={adding}
            className="px-4 py-2 rounded-lg bg-[#e17055] hover:bg-[#f08070] text-white text-sm font-semibold disabled:opacity-60">
            {adding ? "Saving…" : "Save"}
          </button>
          {error && <p className="text-red-400 text-xs w-full">{error}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              {["Detail", "Amount", "Vehicle", "Status", "Added by", "Date"].map(h => (
                <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-[#555]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-[#555]">No penalties</td></tr>
            ) : rows.map(p => (
              <tr key={p.id} className="border-b border-[#1a1a2a]">
                <td className="px-5 py-3 text-[#ccc]">{p.detail ?? "—"}</td>
                <td className="px-5 py-3 text-white whitespace-nowrap">{p.amount != null ? `₹${Number(p.amount).toLocaleString("en-IN")}` : "—"}</td>
                <td className="px-5 py-3 text-[#aaa]">{p.ev_number ?? "—"}</td>
                <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${p.status === "waived" ? "bg-[#1e1e2e] text-[#777]" : p.status === "paid" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}`}>{p.status}</span></td>
                <td className="px-5 py-3 text-[#aaa]">{p.created_by ?? "—"}</td>
                <td className="px-5 py-3 text-[#aaa] whitespace-nowrap">{fmtD(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
