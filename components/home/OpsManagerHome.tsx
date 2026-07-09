import Link from "next/link";
import { getLedgerSummary, getOverdueRiders, getDueSoonRiders } from "@/lib/rent";
import { getFleetRiderCounts } from "@/lib/fleetStats";
import { getRecentRiders } from "@/lib/riderStats";
import { VSTATUS, NOT_AVAILABLE } from "@/lib/vehicleStatus";

const fmt = (n: number) => {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(0) + "K";
  return "₹" + Math.round(n);
};

const statusColor: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  inactive: "bg-gray-500/20 text-gray-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  suspended: "bg-red-500/20 text-red-400",
};

export default async function OpsManagerHome() {
  const [fleet, recentRiders, ledger, overdueRiders, dueSoonRiders] = await Promise.all([
    getFleetRiderCounts(), getRecentRiders(), getLedgerSummary(), getOverdueRiders(), getDueSoonRiders(),
  ]);
  const overdueCount = overdueRiders.length;
  const dueSoonCount = dueSoonRiders.length;
  // Single source: identical to Admin & Investor dashboards.
  const collection = { collected: ledger.collected, expected: ledger.expectedToDate, pending: ledger.overdue, pct: ledger.pct };
  const pctColor = collection.pct >= 80 ? "#00D1B2" : collection.pct >= 50 ? "#fdcb6e" : "#ff6b6b";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Operations Dashboard</h1>
        <p className="text-[#666] text-sm mt-1">Fleet and rider overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Available Riders", value: fleet.pendingRiders, color: "#fdcb6e", href: "/riders?status=pending" },
          { label: "Vehicles Deployed", value: fleet.assignedVehicles, color: "#6C5CE7", href: `/vehicles?status=${VSTATUS.assigned}` },
          { label: "Available Vehicles", value: fleet.availableVehicles, color: "#a29bfe", href: `/vehicles?status=${VSTATUS.available}` },
          { label: "Not Available", value: fleet.notAvailableVehicles, color: "#fdcb6e", href: `/vehicles?status=${NOT_AVAILABLE}` },
          { label: "Overdue Rent", value: overdueCount, color: "#ff6b6b", href: "/riders/overdue" },
          { label: "Due in 2 Days", value: dueSoonCount, color: "#fdcb6e", href: "/riders/due-soon" },
        ].map((c) => (
          <Link key={c.label} href={c.href} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#333] transition-colors">
            <p className="text-[11px] text-[#555] uppercase tracking-wider mb-2">{c.label}</p>
            <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </Link>
        ))}
      </div>

      {/* Rent Collection — collected vs expected (MTD) */}
      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-semibold">Rent Collection — to date</p>
          <span className="text-2xl font-bold" style={{ color: pctColor }}>{collection.pct}%</span>
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-[11px] text-[#666] uppercase tracking-wider mb-1">Collected</p>
            <p className="text-2xl font-bold text-[#00D1B2]">{fmt(collection.collected)}</p>
          </div>
          <Link href="/collections" className="group" title="See which riders' rent is pending">
            <p className="text-[11px] text-[#666] group-hover:text-[#a29bfe] uppercase tracking-wider mb-1">Expected ↗</p>
            <p className="text-2xl font-bold text-[#a29bfe] group-hover:underline">{fmt(collection.expected)}</p>
          </Link>
          <Link href="/collections" className="group" title="See which riders' rent is pending">
            <p className="text-[11px] text-[#666] uppercase tracking-wider mb-1">Pending ↗</p>
            <p className="text-2xl font-bold text-[#ff6b6b] group-hover:underline">{fmt(collection.pending)}</p>
          </Link>
        </div>
        <div className="mt-4 h-2 bg-[#1e1e2e] rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(collection.pct, 100)}%`, background: pctColor }} />
        </div>
        <p className="text-[11px] text-[#555] mt-2">From the rent ledger · tap Expected/Pending for the rider-wise breakdown</p>
      </div>

      {/* Vehicle utilisation bar */}
      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
        <p className="text-white font-semibold mb-4">Fleet Utilisation</p>
        <div className="space-y-3">
          {[
            { label: "Assigned", color: "#00D1B2", val: fleet.assignedVehicles },
            { label: "Available", color: "#a29bfe", val: fleet.availableVehicles },
            { label: "Not Available", color: "#fdcb6e", val: fleet.notAvailableVehicles },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-sm shrink-0" style={{ color: row.color }}>{row.label}</span>
              <div className="flex-1 h-2 bg-[#1e1e2e] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: fleet.totalVehicles ? `${Math.round(row.val / fleet.totalVehicles * 100)}%` : "0%", background: row.color }} />
              </div>
              <span className="w-8 text-right text-white font-semibold text-xs shrink-0">{row.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Riders */}
      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
          <h2 className="text-white font-semibold">Recent Riders</h2>
          <Link href="/riders" className="text-xs text-[#6C5CE7] hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["Name", "Mobile", "Hub", "Vehicle", "Status", "Joined"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRiders.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-[#555]">No riders yet</td></tr>
              ) : recentRiders.map((r: { id: string; name: string; mobile: string; status: string; created_at: string; ev_number: string; vehicle_id: string; hub_name: string }) => (
                <tr key={r.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/riders/${r.id}`} className="text-white font-medium hover:text-[#6C5CE7] hover:underline">{r.name}</Link>
                  </td>
                  <td className="px-5 py-3 text-[#aaa]">{r.mobile}</td>
                  <td className="px-5 py-3 text-[#aaa]">{r.hub_name ?? "—"}</td>
                  <td className="px-5 py-3">{r.vehicle_id ? <Link href={`/vehicles/${r.vehicle_id}`} className="text-[#6C5CE7] hover:underline">{r.ev_number}</Link> : <span className="text-[#555]">—</span>}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${statusColor[r.status] ?? "bg-gray-500/20 text-gray-400"}`}>{r.status}</span>
                  </td>
                  <td className="px-5 py-3 text-[#555] text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
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
