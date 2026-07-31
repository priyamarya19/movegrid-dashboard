"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dateIN, inr } from "@/lib/format";

type Recovery = {
  id: string;
  recovered_date: string;
  reason: string;
  location: string | null;
  notes: string | null;
  photos: string[] | null;
  outstanding: number;
  blacklisted: boolean;
  recovered_by: string | null;
  rider_id: string;
  rider_name: string;
  rider_code: string | null;
  mobile: string;
  vehicle_id: string;
  ev_number: string;
};

const REASON_LABEL: Record<string, string> = {
  non_payment: "Non-payment",
  absconded: "Absconded",
  unreachable: "Unreachable",
  other: "Other",
};

// The recovered-vehicles register — every recovery with its frozen outstanding
// (the bad-debt book), who recovered it and where.
export default function RecoveriesTable() {
  const [rows, setRows] = useState<Recovery[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch("/api/recoveries")
      .then((r) => r.json())
      .then((d) => { setRows(d.recoveries ?? []); setTotal(d.total_outstanding ?? 0); });
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-primary text-2xl font-bold">Recovered Vehicles</h1>
        <p className="text-muted text-sm mt-1">
          Vehicles physically recovered from defaulting riders. The outstanding shown is frozen at recovery time — the recovery-dues register.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Recoveries", value: String(rows?.length ?? "—"), color: "var(--accent-purple)" },
          { label: "Recovery dues", value: inr(total), color: "var(--accent-danger-alt)" },
          { label: "Riders blacklisted", value: String(rows?.filter((r) => r.blacklisted).length ?? "—"), color: "var(--accent-warning)" },
        ].map((c) => (
          <div key={c.label} className="bg-surface border border-default rounded-xl p-4">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-1">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Date", "Rider", "Vehicle", "Reason", "Found at", "Recovery dues", "By", "Proof"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">No recoveries recorded — good news.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-subtle hover:bg-overlay-hover align-top">
                  <td className="px-5 py-3.5 text-secondary whitespace-nowrap">{dateIN(r.recovered_date, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-5 py-3.5">
                    <Link href={`/riders/${r.rider_id}`} className="text-accent-purple hover:underline font-medium">{r.rider_name}</Link>
                    <p className="text-faint text-xs">
                      {r.rider_code ?? "—"} · {r.mobile}
                      {r.blacklisted && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-accent-danger-alt/15 text-accent-danger-alt-text text-[10px] font-semibold">Blacklisted</span>}
                    </p>
                  </td>
                  <td className="px-5 py-3.5"><Link href={`/vehicles/${r.vehicle_id}`} className="text-accent-teal hover:underline font-medium">{r.ev_number}</Link></td>
                  <td className="px-5 py-3.5 text-secondary whitespace-nowrap">
                    {REASON_LABEL[r.reason] ?? r.reason}
                    {r.notes && (
                      <span className="relative group cursor-default ml-1.5 text-muted hover:text-primary">📝
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block whitespace-pre-wrap w-56 bg-surface border border-default rounded-lg px-3 py-1.5 text-[11px] font-normal text-secondary shadow-lg z-10">{r.notes}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-secondary text-xs max-w-[160px] truncate" title={r.location ?? undefined}>{r.location ?? "—"}</td>
                  <td className="px-5 py-3.5 font-bold text-accent-danger-alt-text whitespace-nowrap">{inr(r.outstanding)}</td>
                  <td className="px-5 py-3.5 text-secondary text-xs whitespace-nowrap">{r.recovered_by ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    {r.photos?.length ? (
                      <div className="flex flex-col gap-0.5">
                        {r.photos.map((p, i) => (
                          <a key={i} href={`/api/file?key=${encodeURIComponent(p)}`} target="_blank" rel="noopener noreferrer" className="text-accent-purple text-xs hover:underline">Photo {i + 1}</a>
                        ))}
                      </div>
                    ) : <span className="text-faint text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
