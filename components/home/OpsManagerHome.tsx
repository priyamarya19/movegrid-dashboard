import Link from "next/link";
import { getLedgerSummary, getOverdueRiders, getDueSoonRiders, getPendingThisWeekRiders } from "@/lib/rent";
import { getFleetRiderCounts } from "@/lib/fleetStats";
import { getRecentRiders } from "@/lib/riderStats";
import { VSTATUS, NOT_AVAILABLE } from "@/lib/vehicleStatus";
import { inrCompact, dateIN } from "@/lib/format";

const statusColor: Record<string, string> = {
  active: "bg-accent-success/20 text-accent-success-text",
  inactive: "bg-muted/20 text-muted",
  pending: "bg-accent-warning/20 text-accent-warning-text",
  suspended: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

export default async function OpsManagerHome() {
  const [fleet, recentRiders, ledger, overdueRiders, dueSoonRiders, pendingWeekRiders] = await Promise.all([
    getFleetRiderCounts(), getRecentRiders(), getLedgerSummary(), getOverdueRiders(), getDueSoonRiders(), getPendingThisWeekRiders(),
  ]);
  const overdueCount = overdueRiders.length;
  const dueSoonCount = dueSoonRiders.length;
  const pendingWeekCount = pendingWeekRiders.length;
  // Single source: identical to Admin & Investor dashboards.
  const collection = { collected: ledger.collected, expected: ledger.expectedToDate, pending: ledger.overdue, pct: ledger.pct };
  const pctColor = collection.pct >= 80 ? "var(--accent-teal)" : collection.pct >= 50 ? "var(--accent-warning)" : "var(--accent-danger-alt)";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-primary text-2xl font-bold">Operations Dashboard</h1>
        <p className="text-muted text-sm mt-1">Fleet and rider overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Available Riders", value: fleet.pendingRiders, color: "var(--accent-warning)", href: "/riders?status=pending" },
          { label: "Vehicles Deployed", value: fleet.assignedVehicles, color: "var(--accent-purple)", href: `/vehicles?status=${VSTATUS.assigned}` },
          { label: "Available Vehicles", value: fleet.availableVehicles, color: "var(--accent-purple-2)", href: `/vehicles?status=${VSTATUS.available}` },
          { label: "Not Available", value: fleet.notAvailableVehicles, color: "var(--accent-warning)", href: `/vehicles?status=${NOT_AVAILABLE}` },
          { label: "Overdue Rent", value: overdueCount, color: "var(--accent-danger-alt)", href: "/riders/overdue" },
          { label: "Pending This Week", value: pendingWeekCount, color: "var(--accent-teal)", href: "/riders/pending-week" },
          { label: "Due in 2 Days", value: dueSoonCount, color: "var(--accent-warning)", href: "/riders/due-soon" },
        ].map((c) => (
          <Link key={c.label} href={c.href} className="bg-surface border border-default rounded-xl p-5 hover:border-strong transition-colors">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
            <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </Link>
        ))}
      </div>

      {/* Rent Collection — collected vs expected (MTD) */}
      <div className="bg-surface border border-default rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-primary font-semibold">Rent Collection — to date</p>
          <span className="text-2xl font-bold" style={{ color: pctColor }}>{collection.pct}%</span>
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-[11px] text-muted uppercase tracking-wider mb-1">Collected</p>
            <p className="text-2xl font-bold text-accent-teal">{inrCompact(collection.collected)}</p>
          </div>
          <Link href="/collections" className="group" title="See which riders' rent is pending">
            <p className="text-[11px] text-muted group-hover:text-accent-purple-2 uppercase tracking-wider mb-1">Expected ↗</p>
            <p className="text-2xl font-bold text-accent-purple-2 group-hover:underline">{inrCompact(collection.expected)}</p>
          </Link>
          <Link href="/collections" className="group" title="See which riders' rent is pending">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-1">Pending ↗</p>
            <p className="text-2xl font-bold text-accent-danger-alt group-hover:underline">{inrCompact(collection.pending)}</p>
          </Link>
        </div>
        <div className="mt-4 h-2 bg-default rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(collection.pct, 100)}%`, background: pctColor }} />
        </div>
        <p className="text-[11px] text-muted mt-2">From the rent ledger · tap Expected/Pending for the rider-wise breakdown</p>
      </div>

      {/* Vehicle utilisation bar */}
      <div className="bg-surface border border-default rounded-xl p-5">
        <p className="text-primary font-semibold mb-4">Fleet Utilisation</p>
        <div className="space-y-3">
          {[
            { label: "Assigned", color: "var(--accent-teal)", val: fleet.assignedVehicles },
            { label: "Available", color: "var(--accent-purple-2)", val: fleet.availableVehicles },
            { label: "Not Available", color: "var(--accent-warning)", val: fleet.notAvailableVehicles },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-sm shrink-0" style={{ color: row.color }}>{row.label}</span>
              <div className="flex-1 h-2 bg-default rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: fleet.totalVehicles ? `${Math.round(row.val / fleet.totalVehicles * 100)}%` : "0%", background: row.color }} />
              </div>
              <span className="w-8 text-right text-primary font-semibold text-xs shrink-0">{row.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Riders */}
      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-default flex items-center justify-between">
          <h2 className="text-primary font-semibold">Recent Riders</h2>
          <Link href="/riders" className="text-xs text-accent-purple hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Name", "Mobile", "Hub", "Vehicle", "Status", "Joined"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRiders.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted">No riders yet</td></tr>
              ) : recentRiders.map((r: { id: string; name: string; mobile: string; status: string; created_at: string; ev_number: string; vehicle_id: string; hub_name: string }) => (
                <tr key={r.id} className="border-b border-subtle hover:bg-overlay-hover">
                  <td className="px-5 py-3">
                    <Link href={`/riders/${r.id}`} className="text-primary font-medium hover:text-accent-purple hover:underline">{r.name}</Link>
                  </td>
                  <td className="px-5 py-3 text-secondary">{r.mobile}</td>
                  <td className="px-5 py-3 text-secondary">{r.hub_name ?? "—"}</td>
                  <td className="px-5 py-3">{r.vehicle_id ? <Link href={`/vehicles/${r.vehicle_id}`} className="text-accent-purple hover:underline">{r.ev_number}</Link> : <span className="text-muted">—</span>}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${statusColor[r.status] ?? "bg-muted/20 text-muted"}`}>{r.status}</span>
                  </td>
                  <td className="px-5 py-3 text-muted text-xs whitespace-nowrap">
                    {dateIN(r.created_at, { day: "numeric", month: "short" })}
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
