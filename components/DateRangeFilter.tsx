"use client";

import { RANGE_PRESETS } from "@/lib/dateRange";

export type RangeValue = { range: string; from: string; to: string };

const ctl = "bg-base border border-default rounded-xl px-3 py-2 text-primary text-sm focus:outline-none focus:border-accent-teal transition-colors";

// Shared preset + custom range picker. The parent owns the value and refetches
// on change; this component only renders the controls.
export default function DateRangeFilter({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={ctl} value={value.range} onChange={(e) => onChange({ ...value, range: e.target.value })}>
        {RANGE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      {value.range === "custom" && (
        <>
          <input type="date" className={ctl} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-muted text-xs">to</span>
          <input type="date" className={ctl} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </>
      )}
    </div>
  );
}

// Build a query string from a RangeValue (only the relevant keys).
export function rangeQuery(v: RangeValue): string {
  const p = new URLSearchParams();
  if (v.range && v.range !== "all") p.set("range", v.range);
  if (v.range === "custom") {
    if (v.from) p.set("from", v.from);
    if (v.to) p.set("to", v.to);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
