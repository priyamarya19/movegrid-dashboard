"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dateIN } from "@/lib/format";

type Event = {
  kind: "deployed" | "returned" | "recovered" | "status";
  at: string;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  actor: string | null;
  rider_name: string | null;
  rider_id: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  under_maintenance: "Under Maintenance", mechanically_ok: "Mechanically OK",
  ready_to_deploy: "Ready to Deploy", assigned: "Assigned", returned: "Returned",
};

const KIND_META: Record<Event["kind"], { icon: string; cls: string }> = {
  deployed: { icon: "🛵", cls: "text-accent-success-text" },
  returned: { icon: "↩️", cls: "text-accent-warning-text" },
  recovered: { icon: "🚨", cls: "text-accent-danger-alt-text" },
  status: { icon: "🔧", cls: "text-accent-purple" },
};

// The vehicle's life story, newest first: deployments, returns, recoveries and
// every manual state change with its reason. State-change entries accumulate
// from the day the status log shipped; deployment history is complete.
export default function VehicleHistory({ vehicleId }: { vehicleId: string }) {
  const [events, setEvents] = useState<Event[] | null>(null);

  useEffect(() => {
    fetch(`/api/vehicles/${vehicleId}/history`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []));
  }, [vehicleId]);

  return (
    <div className="bg-surface border border-default rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-default">
        <h2 className="text-primary font-semibold">Vehicle History</h2>
        <p className="text-muted text-xs mt-0.5">Every deployment, return and state change — newest first.</p>
      </div>
      <div className="p-5">
        {events === null ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-muted text-sm">No history yet.</p>
        ) : (
          <ol className="space-y-0">
            {events.map((e, i) => {
              const meta = KIND_META[e.kind];
              return (
                <li key={i} className="relative pl-6 pb-4 border-l border-subtle last:pb-0 ml-2">
                  <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-surface border border-strong flex items-center justify-center text-[9px]">{meta.icon}</span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`text-sm font-semibold ${meta.cls}`}>
                      {e.kind === "deployed" && "Deployed"}
                      {e.kind === "returned" && "Returned"}
                      {e.kind === "recovered" && "Recovered"}
                      {e.kind === "status" && `${e.from_status ? `${STATUS_LABEL[e.from_status] ?? e.from_status} → ` : "→ "}${STATUS_LABEL[e.to_status ?? ""] ?? e.to_status}`}
                    </span>
                    {e.rider_name && e.rider_id && (
                      <Link href={`/riders/${e.rider_id}`} className="text-sm text-accent-purple hover:underline">{e.rider_name}</Link>
                    )}
                    <span className="text-xs text-muted">{e.at ? dateIN(e.at, { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                    {e.actor && <span className="text-xs text-faint">by {e.actor}</span>}
                  </div>
                  {e.detail && <p className="text-xs text-secondary mt-0.5">{e.detail}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
