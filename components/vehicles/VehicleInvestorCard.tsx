"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  vehicleId: string;
  investorId: string | null;
  investorName: string | null;
  totalInvested: number | null;
  canEdit: boolean;
};

type InvestorOption = { id: string; name: string };

export default function VehicleInvestorCard({ vehicleId, investorId, investorName, totalInvested, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [options, setOptions] = useState<InvestorOption[]>([]);
  const [selected, setSelected] = useState(investorId ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function startEdit() {
    setError("");
    setEditing(true);
    if (options.length === 0) {
      setLoading(true);
      try {
        const res = await fetch("/api/investors");
        const data = await res.json();
        if (Array.isArray(data)) setOptions(data.map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })));
      } finally { setLoading(false); }
    }
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investor_id: selected || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to update"); return; }
      setEditing(false);
      router.refresh();
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold">Investor</h2>
        {canEdit && !editing && (
          <button onClick={startEdit} className="text-xs text-[#00D1B2] hover:underline">
            {investorId ? "Change" : "Map investor"}
          </button>
        )}
      </div>

      {!editing ? (
        investorId ? (
          <Link href={`/investors/${investorId}`} className="flex items-center justify-between group">
            <div>
              <p className="text-[#00D1B2] font-medium group-hover:underline">{investorName}</p>
              <p className="text-[#555] text-xs">₹{Number(totalInvested).toLocaleString()} invested</p>
            </div>
            <span className="text-[#555] group-hover:text-white">→</span>
          </Link>
        ) : <p className="text-[#555] text-sm">No investor linked</p>
      ) : (
        <div className="space-y-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={loading}
            className="w-full bg-[#0A0A0F] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00D1B2]"
          >
            <option value="">— No investor —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving || loading}
              className="px-4 py-1.5 rounded-lg bg-[#00D1B2] hover:bg-[#13e0c2] text-[#06231f] text-xs font-semibold disabled:opacity-60 transition-colors">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => { setEditing(false); setSelected(investorId ?? ""); setError(""); }}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white text-xs transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
