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
        className="px-4 py-2 rounded-lg bg-accent-purple hover:bg-accent-purple text-primary text-xs font-semibold transition-colors">
        + Map vehicles
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative bg-surface border border-default rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-default flex items-center justify-between">
          <div>
            <h2 className="text-primary font-semibold">Map Vehicles</h2>
            <p className="text-muted text-xs mt-0.5">Only vehicles not linked to any investor are shown</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-primary">✕</button>
        </div>

        <div className="px-5 py-3 border-b border-default">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search EV number or model…"
            className="w-full bg-base border border-default rounded-xl px-3 py-2 text-primary text-sm placeholder-faint focus:outline-none focus:border-accent-purple"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-5 py-8 text-center text-muted text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted text-sm">
              {vehicles.length === 0 ? "No unassigned vehicles available" : "No matches"}
            </p>
          ) : (
            <ul>
              {filtered.map((v) => {
                const checked = selected.has(v.id);
                return (
                  <li key={v.id}>
                    <label className="flex items-center gap-3 px-5 py-3 border-b border-subtle hover:bg-overlay-hover cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggle(v.id)}
                        className="w-4 h-4 accent-accent-purple" />
                      <div className="flex-1 min-w-0">
                        <p className="text-primary text-sm font-medium">{v.ev_number}</p>
                        <p className="text-muted text-xs">{v.model_name ?? "—"}{v.hub_name ? ` · ${v.hub_name}` : ""}</p>
                      </div>
                      <span className="text-muted text-xs capitalize">{v.status}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && <p className="px-5 py-2 text-accent-danger-alt-text text-xs">{error}</p>}

        <div className="px-5 py-4 border-t border-default flex items-center justify-between">
          <span className="text-muted text-xs">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg border border-default text-muted hover:text-primary text-sm transition-colors">
              Cancel
            </button>
            <button onClick={mapSelected} disabled={saving || selected.size === 0}
              className="px-4 py-2 rounded-lg bg-accent-purple hover:bg-accent-purple text-primary text-sm font-semibold disabled:opacity-60 transition-colors">
              {saving ? "Mapping…" : `Map ${selected.size} vehicle${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
