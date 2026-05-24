import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";
import Link from "next/link";

type Props = { name: string };

const getStats = unstable_cache(async function getStats() {
  const [riders, vehicles] = await Promise.all([
    pool.query(`SELECT status, COUNT(*) FROM ${schemas.ops}.riders GROUP BY status`),
    pool.query(`SELECT status, COUNT(*) FROM ${schemas.ops}.vehicles GROUP BY status`),
  ]);

  const rMap: Record<string, number> = {};
  riders.rows.forEach((r: { status: string; count: string }) => { rMap[r.status] = Number(r.count); });
  const vMap: Record<string, number> = {};
  vehicles.rows.forEach((r: { status: string; count: string }) => { vMap[r.status] = Number(r.count); });

  return {
    activeRiders: rMap["active"] ?? 0,
    pendingRiders: rMap["pending"] ?? 0,
    assignedVehicles: vMap["assigned"] ?? 0,
    availableVehicles: vMap["available"] ?? 0,
  };
}, ["hub-stats"], { revalidate: 60 });

const getRecentRiders = unstable_cache(async function getRecentRiders() {
  const res = await pool.query(`
    SELECT r.id, r.name, r.mobile, r.status, r.created_at,
           v.ev_number
    FROM ${schemas.ops}.riders r
    LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.rider_id = r.id AND rva.status = 'active'
    LEFT JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
    ORDER BY r.created_at DESC LIMIT 8
  `);
  return res.rows;
}, ["hub-recent-riders"], { revalidate: 30 });

const statusColor: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  inactive: "bg-gray-500/20 text-gray-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  suspended: "bg-red-500/20 text-red-400",
};

const quickActions = [
  { label: "Add Rider", desc: "Onboard a new rider", href: "/riders/new", color: "#6C5CE7", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><line x1="12" y1="14" x2="12" y2="20"/><line x1="9" y1="17" x2="15" y2="17"/></svg> },
  { label: "Allot Vehicle", desc: "Assign scooter to rider", href: "/allotments/new", color: "#fdcb6e", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/><circle cx="16" cy="17" r="2"/><circle cx="9" cy="17" r="2"/><line x1="19" y1="11" x2="19" y2="17"/></svg> },
  { label: "Vehicle Return", desc: "Record a vehicle return", href: "/allotments/return", color: "#e17055", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg> },
  { label: "View Riders", desc: "See all riders", href: "/riders", color: "#00D1B2", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
];

export default async function HubInchargeHome({ name }: Props) {
  const [stats, riders] = await Promise.all([getStats(), getRecentRiders()]);
  const firstName = name.split(" ")[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold">Good morning, {firstName} 👋</h1>
        <p className="text-[#666] text-sm mt-1">Here&apos;s your hub overview for today</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Riders", value: stats.activeRiders, color: "#00D1B2", href: "/riders?status=active" },
          { label: "Pending KYC", value: stats.pendingRiders, color: "#fdcb6e", href: "/riders?status=pending" },
          { label: "Vehicles Deployed", value: stats.assignedVehicles, color: "#6C5CE7", href: "/vehicles?status=assigned" },
          { label: "Available Vehicles", value: stats.availableVehicles, color: "#a29bfe", href: "/vehicles?status=available" },
        ].map((c) => (
          <Link key={c.label} href={c.href} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#333] transition-colors">
            <p className="text-[11px] text-[#555] uppercase tracking-wider mb-2">{c.label}</p>
            <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-white font-semibold mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((a) => (
            <Link key={a.label} href={a.href}
              className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-4 hover:border-[#333] hover:bg-[#16161f] transition-colors flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: a.color + "20", color: a.color }}>
                {a.icon}
              </div>
              <div>
                <p className="text-white text-sm font-semibold">{a.label}</p>
                <p className="text-[#555] text-xs mt-0.5">{a.desc}</p>
              </div>
            </Link>
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
                {["Name", "Mobile", "Vehicle", "Status", "Joined"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riders.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-[#555]">No riders yet</td></tr>
              ) : riders.map((r: { id: string; name: string; mobile: string; status: string; created_at: string; ev_number: string }) => (
                <tr key={r.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/riders/${r.id}`} className="text-white font-medium hover:text-[#6C5CE7] hover:underline">{r.name}</Link>
                  </td>
                  <td className="px-5 py-3 text-[#aaa]">{r.mobile}</td>
                  <td className="px-5 py-3 text-[#6C5CE7]">{r.ev_number ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${statusColor[r.status] ?? "bg-gray-500/20 text-gray-400"}`}>{r.status}</span>
                  </td>
                  <td className="px-5 py-3 text-[#555] text-xs">
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
