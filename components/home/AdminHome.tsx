import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import RidersChart from "@/components/charts/RidersChart";
import VehicleDonut from "@/components/charts/VehicleDonut";
import CollectionsChart from "@/components/charts/CollectionsChart";
import RevenuePie from "@/components/charts/RevenuePie";

type Props = { role: string; name: string };

const getStats = unstable_cache(async function getStats() {
  const [vehicles, rentMTD, onboardMTD, securityMTD, totalInvestments] = await Promise.all([
    pool.query(`SELECT status, COUNT(*) FROM ${schemas.ops}.vehicles GROUP BY status`),
    pool.query(`SELECT COALESCE(SUM(amount_collected),0) AS total FROM ${schemas.ops}.rider_payments WHERE DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(onboarding_fee),0) AS total FROM ${schemas.ops}.riders WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(security_deposit),0) AS total FROM ${schemas.ops}.riders WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(total_invested),0) AS total FROM ${schemas.ops}.investor_profiles`),
  ]);

  const vMap: Record<string, number> = {};
  vehicles.rows.forEach((r: { status: string; count: string }) => { vMap[r.status] = Number(r.count); });
  const totalVehicles = Object.values(vMap).reduce((a, b) => a + b, 0);

  return {
    assignedVehicles: vMap["assigned"] ?? 0,
    availableVehicles: vMap["available"] ?? 0,
    maintenanceVehicles: vMap["maintenance"] ?? 0,
    totalVehicles,
    rentMTD: Number(rentMTD.rows[0].total),
    onboardMTD: Number(onboardMTD.rows[0].total),
    securityMTD: Number(securityMTD.rows[0].total),
    totalInvestments: Number(totalInvestments.rows[0].total),
  };
}, ["admin-stats-v2"], { revalidate: 60 });

const getRecentLeads = unstable_cache(async function getRecentLeads() {
  const res = await pool.query(
    `SELECT id, type, name, phone, status, created_at FROM ${schemas.leads}.leads ORDER BY created_at DESC LIMIT 5`
  );
  return res.rows;
}, ["admin-leads"], { revalidate: 30 });

const getAuditLogs = unstable_cache(async function getAuditLogs() {
  const res = await pool.query(
    `SELECT action, entity, details, created_at FROM ${schemas.logs}.audit_logs ORDER BY created_at DESC LIMIT 6`
  );
  return res.rows;
}, ["admin-audit-logs"], { revalidate: 30 });

const getRevenueSummary = unstable_cache(async function getRevenueSummary() {
  const res = await pool.query(`
    WITH rent AS (
      SELECT DATE_TRUNC('month', payment_date) AS m, COALESCE(SUM(amount_collected),0) AS rent
      FROM ${schemas.ops}.rider_payments GROUP BY 1
    ),
    onboard AS (
      SELECT DATE_TRUNC('month', created_at) AS m,
             COALESCE(SUM(onboarding_fee),0) AS onboard,
             COALESCE(SUM(security_deposit),0) AS security
      FROM ${schemas.ops}.riders GROUP BY 1
    ),
    payouts AS (
      SELECT DATE_TRUNC('month', paid_date) AS m, COALESCE(SUM(amount),0) AS payouts
      FROM ${schemas.ops}.investor_payouts WHERE status = 'paid' AND paid_date IS NOT NULL GROUP BY 1
    ),
    months AS (
      SELECT m FROM rent UNION SELECT m FROM onboard UNION SELECT m FROM payouts
    )
    SELECT
      TO_CHAR(months.m, 'Mon YYYY') AS month,
      months.m AS month_date,
      COALESCE(r.rent, 0) AS rent,
      COALESCE(o.onboard, 0) AS onboard,
      COALESCE(o.security, 0) AS security,
      COALESCE(p.payouts, 0) AS payouts
    FROM months
    LEFT JOIN rent r ON r.m = months.m
    LEFT JOIN onboard o ON o.m = months.m
    LEFT JOIN payouts p ON p.m = months.m
    ORDER BY months.m DESC
    LIMIT 12
  `);
  return res.rows;
}, ["admin-revenue-v1"], { revalidate: 300 });

const fmt = (n: number) => {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(0) + "K";
  return "₹" + n;
};

const statusColor: Record<string, string> = {
  new: "bg-[#6C5CE720] text-[#6C5CE7]",
  contacted: "bg-[#00D1B220] text-[#00D1B2]",
  converted: "bg-[#00b89420] text-[#00b894]",
  rejected: "bg-red-500/20 text-red-400",
};

const typeColor: Record<string, string> = {
  investor: "text-[#00D1B2]",
  rider: "text-[#6C5CE7]",
  fleet: "text-[#fdcb6e]",
};

const dotColor: Record<string, string> = {
  onboard_rider: "#00D1B2",
  assign_vehicle: "#6C5CE7",
  record_payment: "#fdcb6e",
  update_lead: "#e17055",
  payout_marked: "#a29bfe",
  new_lead: "#00D1B2",
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

const actionLabel: Record<string, string> = {
  onboard_rider: "Rider onboarded",
  assign_vehicle: "Vehicle assigned",
  record_payment: "Payment recorded",
  update_lead: "Lead status updated",
  payout_marked: "Investor payout marked paid",
  new_lead: "New lead received",
  create_user: "New user created",
  unassign_vehicle: "Vehicle unassigned",
};

function activityText(log: { action: string; details: unknown }) {
  try {
    const d: Record<string, unknown> = log.details
      ? typeof log.details === "object"
        ? (log.details as Record<string, unknown>)
        : JSON.parse(log.details as string)
      : {};
    switch (log.action) {
      case "onboard_rider": return d.name ? <>Rider <strong>{String(d.name)}</strong> onboarded{d.hub ? <> at {String(d.hub)}</> : ""}</> : <>Rider onboarded</>;
      case "assign_vehicle": return d.vehicle ? <>Vehicle <strong>{String(d.vehicle)}</strong> assigned to {d.rider ? String(d.rider) : "rider"}</> : <>Vehicle assigned to rider</>;
      case "record_payment": return d.amount ? <>Payment of <strong>{fmt(Number(d.amount))}</strong> recorded{d.rider ? <> for {String(d.rider)}</> : ""}</> : <>Rental payment recorded</>;
      case "update_lead": return d.name ? <>Lead <strong>{String(d.name)}</strong> status → {d.status ? String(d.status) : "updated"}</> : <>Lead status updated</>;
      case "payout_marked": return d.amount ? <>Investor payout of <strong>{fmt(Number(d.amount))}</strong> marked as Paid</> : <>Investor payout marked as paid</>;
      case "new_lead": return d.name ? <>New {d.type ? String(d.type) : ""} lead: <strong>{String(d.name)}</strong></> : <>New lead received</>;
      default: return <>{actionLabel[log.action] ?? log.action.replace(/_/g, " ")}</>;
    }
  } catch { return <>{actionLabel[log.action] ?? log.action.replace(/_/g, " ")}</>; }
}


export default async function AdminHome({ role, name }: Props) {
  const [stats, leads, logs, revenueSummary] = await Promise.all([getStats(), getRecentLeads(), getAuditLogs(), getRevenueSummary()]);

  const roleLabel: Record<string, string> = { admin: "Admin", ops_manager: "Ops Manager", hub_incharge: "Hub Incharge" };
  const currentMonth = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const statCards = [
    { label: "Total Vehicles", value: stats.totalVehicles.toString(), change: `${stats.assignedVehicles} deployed`, sub: `${stats.availableVehicles} available`, accent: "#6C5CE7", up: true, href: "/vehicles" },
    { label: "Vehicles Deployed", value: `${stats.assignedVehicles} / ${stats.totalVehicles}`, change: `${stats.totalVehicles ? Math.round((stats.assignedVehicles / stats.totalVehicles) * 100) : 0}% utilization`, sub: `${stats.availableVehicles} awaiting allotment`, accent: "#00D1B2", up: true, href: "/vehicles" },
    { label: "Rent Collected", value: fmt(stats.rentMTD), change: "This month", sub: fmt(stats.onboardMTD) + " onboarding", accent: "#fdcb6e", up: true, href: "/riders" },
    { label: "Onboarding Fees", value: fmt(stats.onboardMTD), change: "This month", sub: fmt(stats.securityMTD) + " security dep.", accent: "#e17055", up: true, href: "/riders" },
    { label: "Total Investments", value: fmt(stats.totalInvestments), change: "All investors", sub: "View details", accent: "#a29bfe", up: true, href: "/investors" },
  ];

  return (
    <div>
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-4 lg:px-7 lg:py-5 border-b border-[#1e1e2e] bg-[#0A0A0F] sticky top-0 z-10">
        <div>
          <h2 className="text-lg font-semibold text-white">Good morning, {name} 👋</h2>
          <p className="text-[#666] text-sm mt-0.5">Here&apos;s what&apos;s happening with your fleet today</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="bg-[#6C5CE720] text-[#6C5CE7] px-4 py-1.5 rounded-full text-xs font-semibold">📅 {currentMonth}</span>
          <span className="text-xs text-gray-500 uppercase tracking-wider">{roleLabel[role] ?? role}</span>
        </div>
      </div>

      <div className="p-4 lg:p-7 space-y-6">

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map((card) => (
            <Link key={card.label} href={card.href} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-[18px] relative overflow-hidden hover:border-[#333] hover:bg-[#16161f] transition-colors block">
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: card.accent }} />
              <p className="text-[11px] text-[#666] uppercase tracking-wider mb-2">{card.label}</p>
              <p className="text-[26px] font-bold text-white mb-1.5">{card.value}</p>
              <p className={`text-xs flex items-center gap-1 ${card.up ? "text-[#00D1B2]" : "text-[#ff6b6b]"}`}>
                {card.up ? "↑" : "↓"} {card.change}
              </p>
              <p className="text-[11px] text-[#555] mt-1">{card.sub}</p>
            </Link>
          ))}
        </div>

        {/* Riders chart + Vehicle allocation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-white">Riders Onboarded</p>
                <p className="text-xs text-[#555] mt-0.5">Daily trend with MTD comparison</p>
              </div>
              <div className="flex gap-1">
                {["Daily","Monthly","Yearly"].map((t, i) => (
                  <span key={t} className={`px-2.5 py-1 rounded text-[11px] border cursor-pointer ${i === 0 ? "bg-[#6C5CE720] text-[#6C5CE7] border-[#6C5CE740]" : "bg-[#0A0A0F] text-[#666] border-[#1e1e2e]"}`}>{t}</span>
                ))}
              </div>
            </div>
            <RidersChart />
          </div>

          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold text-white">Vehicle Allocation</p>
              <p className="text-xs text-[#555] mt-0.5">{stats.totalVehicles} total vehicles</p>
            </div>
            <VehicleDonut assigned={stats.assignedVehicles} available={stats.availableVehicles} maintenance={stats.maintenanceVehicles} />
            <div className="mt-3 space-y-3">
              {[
                { label: "Assigned", color: "#00D1B2", val: stats.assignedVehicles, pct: Math.round(stats.assignedVehicles / stats.totalVehicles * 100) },
                { label: "Available", color: "#fdcb6e", val: stats.availableVehicles, pct: Math.round(stats.availableVehicles / stats.totalVehicles * 100) },
                { label: "Maintenance", color: "#e17055", val: stats.maintenanceVehicles, pct: Math.round(stats.maintenanceVehicles / stats.totalVehicles * 100) },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 text-sm">
                  <span className="w-20 text-sm" style={{ color: row.color }}>{row.label}</span>
                  <div className="flex-1 h-2 bg-[#1e1e2e] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                  <span className="w-8 text-right text-white font-semibold text-xs">{row.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue Summary Table */}
        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-white">Revenue Summary</p>
              <p className="text-xs text-[#555] mt-0.5">Monthly breakdown — collected vs paid out vs net</p>
            </div>
            <div className="flex gap-1">
              {["Monthly","Yearly"].map((t, i) => (
                <span key={t} className={`px-2.5 py-1 rounded text-[11px] border cursor-pointer ${i === 0 ? "bg-[#6C5CE720] text-[#6C5CE7] border-[#6C5CE740]" : "bg-[#0A0A0F] text-[#666] border-[#1e1e2e]"}`}>{t}</span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                <th className="text-left pb-3 text-[11px] text-[#555] uppercase tracking-wider whitespace-nowrap">Month</th>
                <th className="text-left pb-3 text-[11px] uppercase tracking-wider text-[#00D1B2] whitespace-nowrap">Rent</th>
                <th className="text-left pb-3 text-[11px] uppercase tracking-wider text-[#6C5CE7] whitespace-nowrap">Onboarding</th>
                <th className="text-left pb-3 text-[11px] uppercase tracking-wider text-[#a29bfe] whitespace-nowrap">Security Dep.</th>
                <th className="text-left pb-3 text-[11px] uppercase tracking-wider text-[#e17055] whitespace-nowrap">Investor Payouts</th>
                <th className="text-left pb-3 text-[11px] uppercase tracking-wider text-white whitespace-nowrap">Net Revenue</th>
              </tr>
            </thead>
            <tbody>
              {revenueSummary.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-[#555]">No revenue data yet</td></tr>
              ) : revenueSummary.map((row: { month: string; rent: number; onboard: number; security: number; payouts: number }, i: number) => {
                const net = Number(row.rent) + Number(row.onboard) + Number(row.security) - Number(row.payouts);
                const isCurrent = i === 0;
                return (
                  <tr key={row.month} className="border-b border-[#1a1a2a]">
                    <td className={`py-2.5 ${isCurrent ? "font-bold text-white" : "text-[#ccc]"}`}>{row.month}</td>
                    <td className="py-2.5 text-[#00D1B2]">{fmt(Number(row.rent))}</td>
                    <td className="py-2.5 text-[#6C5CE7]">{fmt(Number(row.onboard))}</td>
                    <td className="py-2.5 text-[#a29bfe]">{fmt(Number(row.security))}</td>
                    <td className="py-2.5 text-[#e17055]">{Number(row.payouts) > 0 ? `−${fmt(Number(row.payouts))}` : "—"}</td>
                    <td className={`py-2.5 font-bold ${isCurrent ? "text-[#00D1B2]" : "text-white"}`}>{fmt(net)}</td>
                  </tr>
                );
              })}
              {revenueSummary.length > 0 && (() => {
                const ytdRent = revenueSummary.reduce((s: number, r: { rent: number }) => s + Number(r.rent), 0);
                const ytdOnboard = revenueSummary.reduce((s: number, r: { onboard: number }) => s + Number(r.onboard), 0);
                const ytdSecurity = revenueSummary.reduce((s: number, r: { security: number }) => s + Number(r.security), 0);
                const ytdPayouts = revenueSummary.reduce((s: number, r: { payouts: number }) => s + Number(r.payouts), 0);
                const ytdNet = ytdRent + ytdOnboard + ytdSecurity - ytdPayouts;
                return (
                  <tr className="border-t-2 border-[#6C5CE740]">
                    <td className="py-2.5 font-bold text-[#6C5CE7]">YTD Total</td>
                    <td className="py-2.5 font-bold text-[#00D1B2]">{fmt(ytdRent)}</td>
                    <td className="py-2.5 font-bold text-[#6C5CE7]">{fmt(ytdOnboard)}</td>
                    <td className="py-2.5 font-bold text-[#a29bfe]">{fmt(ytdSecurity)}</td>
                    <td className="py-2.5 font-bold text-[#e17055]">{ytdPayouts > 0 ? `−${fmt(ytdPayouts)}` : "—"}</td>
                    <td className="py-2.5 font-bold text-[#00D1B2] text-[15px]">{fmt(ytdNet)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
          </div>
        </div>

        {/* Collections chart + Revenue pie */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-white">Collections vs Payouts</p>
                <p className="text-xs text-[#555] mt-0.5">Rent + Onboarding + Security vs Investor Payouts + Refunds</p>
              </div>
              <div className="flex gap-1">
                {["Monthly","Weekly"].map((t, i) => (
                  <span key={t} className={`px-2.5 py-1 rounded text-[11px] border cursor-pointer ${i === 0 ? "bg-[#6C5CE720] text-[#6C5CE7] border-[#6C5CE740]" : "bg-[#0A0A0F] text-[#666] border-[#1e1e2e]"}`}>{t}</span>
                ))}
              </div>
            </div>
            <CollectionsChart />
          </div>

          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold text-white">Revenue Breakdown</p>
              <p className="text-xs text-[#555] mt-0.5">This month — IN only</p>
            </div>
            <RevenuePie />
            <div className="mt-3 space-y-0">
              {(() => {
                const totalIn = stats.rentMTD + stats.onboardMTD + stats.securityMTD;
                const pct = (n: number) => totalIn > 0 ? ` (${Math.round(n / totalIn * 100)}%)` : "";
                return [
                  { label: "Rent", color: "#00D1B2", val: fmt(stats.rentMTD) + pct(stats.rentMTD) },
                  { label: "Onboarding", color: "#6C5CE7", val: fmt(stats.onboardMTD) + pct(stats.onboardMTD) },
                  { label: "Security", color: "#a29bfe", val: fmt(stats.securityMTD) + pct(stats.securityMTD) },
                  { label: "Total IN", color: "#fdcb6e", val: fmt(totalIn) },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between py-1.5 border-b border-[#1e1e2e] last:border-0 text-xs">
                    <span style={{ color: row.color }}>● {row.label}</span>
                    <span className="text-white font-semibold">{row.val}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Recent Leads + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Leads */}
          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Recent Leads</p>
              <Link href="/leads" className="text-xs text-[#6C5CE7] hover:underline">View all →</Link>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  {["Name","Type","Phone","Status"].map((h) => (
                    <th key={h} className="text-left pb-3 text-[11px] text-[#555] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5">
                      <Link href={`/leads/${lead.id}`} className="text-[#ccc] hover:text-white hover:underline transition-colors">{lead.name}</Link>
                    </td>
                    <td className={`py-2.5 font-medium capitalize ${typeColor[lead.type] ?? "text-gray-400"}`}>{lead.type}</td>
                    <td className="py-2.5 text-[#ccc]">{lead.phone ?? "—"}</td>
                    <td className="py-2.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusColor[lead.status] ?? "bg-gray-500/20 text-gray-400"}`}>
                        {lead.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Activity */}
          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Recent Activity</p>
              <Link href="/logs" className="text-xs text-[#6C5CE7] hover:underline">View logs →</Link>
            </div>
            <div className="space-y-0">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3 items-start py-2.5 border-b border-[#1a1a2a] last:border-0">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dotColor[log.action] ?? "#666" }} />
                  <div>
                    <p className="text-sm text-[#ccc] leading-snug">{activityText(log)}</p>
                    <p className="text-[11px] text-[#555] mt-0.5">{timeAgo(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
