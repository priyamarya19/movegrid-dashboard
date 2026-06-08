"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { investorId: string };

type Vehicle = {
  id: string;
  ev_number: string;
  model_name: string | null;
  status: string;
  hub_name: string | null;
};

export default function MapVehiclesPanel({ investorId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function openPanel() {
    setOpen(true);
    setError("");
    setSelected(new Set());
    setLoading(true);
    try {
      const res = await fetch("/api/vehicles?unassigned=1");
      const data = await res.json();
      setVehicles(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function mapSelected() {
    if (selected.size === 0) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/investors/${investorId}/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to map vehicles"); return; }
      setOpen(false);
      router.refresh();
    } finally { setSaving(false); }
  }

  const filtered = vehicles.filter((v) =>
    !query ||
    v.ev_number.toLowerCase().includes(query.toLowerCase()) ||
    (v.model_name ?? "").toLowerCase().includes(query.toLowerCase())
  );

  if (!open) {
    return (
      <button onClick={openPanel}
        className="px-4 py-2 rounded-lg bg-[#6C5CE7] hover:bg-[#7d6df0] text-white text-xs font-semibold transition-colors">
        + Map vehicles
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative bg-[#12121A] border border-[#1e1e2e] rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">Map Vehicles</h2>
            <p className="text-[#555] text-xs mt-0.5">Only vehicles not linked to any investor are shown</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-[#555] hover:text-white">✕</button>
        </div>

        <div className="px-5 py-3 border-b border-[#1e1e2e]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search EV number or model…"
            className="w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#6C5CE7]"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-5 py-8 text-center text-[#555] text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-[#555] text-sm">
              {vehicles.length === 0 ? "No unassigned vehicles available" : "No matches"}
            </p>
          ) : (
            <ul>
              {filtered.map((v) => {
                const checked = selected.has(v.id);
                return (
                  <li key={v.id}>
                    <label className="flex items-center gap-3 px-5 py-3 border-b border-[#1a1a2a] hover:bg-white/[0.02] cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggle(v.id)}
                        className="w-4 h-4 accent-[#6C5CE7]" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{v.ev_number}</p>
                        <p className="text-[#555] text-xs">{v.model_name ?? "—"}{v.hub_name ? ` · ${v.hub_name}` : ""}</p>
                      </div>
                      <span className="text-[#555] text-xs capitalize">{v.status}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && <p className="px-5 py-2 text-red-400 text-xs">{error}</p>}

        <div className="px-5 py-4 border-t border-[#1e1e2e] flex items-center justify-between">
          <span className="text-[#777] text-xs">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">
              Cancel
            </button>
            <button onClick={mapSelected} disabled={saving || selected.size === 0}
              className="px-4 py-2 rounded-lg bg-[#6C5CE7] hover:bg-[#7d6df0] text-white text-sm font-semibold disabled:opacity-60 transition-colors">
              {saving ? "Mapping…" : `Map ${selected.size} vehicle${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
