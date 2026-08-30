"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dateIN, inr } from "@/lib/format";

type WriteOff = {
  id: string; amount: number; days: number | null; reason: string; decided_by: string;
  occurred_on: string | null; recorded_on: string;
  rider_id: string | null; rider_name: string | null; rider_code: string | null;
  mobile: string | null; ev_number: string | null;
};

/**
 * Finance → Write-offs: revenue we decided not to collect.
 *
 * Not the same thing as bad debt, and kept apart on purpose. Bad debt is a
 * rider who owed and did not pay. This is rent that was never properly billed
 * because we got something wrong — the riders here mostly paid everything they
 * were ever asked for, and listing them as defaulters would be wrong.
 *
 * The reason is shown in full rather than truncated: each of these is a
 * judgement someone made, and the reasoning is the point of keeping the record.
 */
export default function WriteOffsTab() {
  const [rows, setRows] = useState<WriteOff[] | null>(null);
  const [totals, setTotals] = useState({ amount: 0, days: 0, count: 0 });

  useEffect(() => {
    fetch("/api/write-offs")
      .then((r) => r.json())
      .then((d) => { setRows(d.writeOffs ?? []); setTotals(d.totals ?? { amount: 0, days: 0, count: 0 }); })
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return <p className="text-muted text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Written off", value: inr(totals.amount), color: "var(--accent-warning)" },
          { label: "Rent days given away", value: String(totals.days), color: "var(--accent-purple)" },
          { label: "Entries", value: String(totals.count), color: "var(--accent-teal)" },
        ].map((c) => (
          <div key={c.label} className="bg-surface border border-default rounded-xl p-5">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      <p className="text-muted text-sm">
        Rent that was recorded but never collected, and that we chose to absorb rather than bill.
        Nobody here is in arrears — these riders keep the days, and none of this appears on their account.
      </p>

      {rows.length === 0 ? (
        <div className="bg-surface border border-default rounded-2xl p-10 text-center text-muted">
          Nothing written off.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((w) => (
            <div key={w.id} className="bg-surface border border-default rounded-2xl p-5 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  {w.rider_id ? (
                    <Link href={`/riders/${w.rider_id}`} className="text-accent-purple hover:underline font-semibold">
                      {w.rider_name}
                    </Link>
                  ) : (
                    <span className="text-primary font-semibold">{w.rider_name ?? "—"}</span>
                  )}
                  <p className="text-faint text-xs mt-0.5">
                    {w.rider_code ?? "—"}{w.mobile ? ` · ${w.mobile}` : ""}{w.ev_number ? ` · ${w.ev_number}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-accent-warning-text font-bold">{inr(w.amount)}</p>
                  <p className="text-faint text-xs">
                    {w.days ? `${w.days} day${w.days === 1 ? "" : "s"} · ` : ""}
                    {w.occurred_on ? dateIN(w.occurred_on, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </p>
                </div>
              </div>
              <p className="text-secondary text-sm leading-relaxed">{w.reason}</p>
              <p className="text-faint text-xs">
                Decided by {w.decided_by} · recorded {dateIN(w.recorded_on, { day: "numeric", month: "short" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
