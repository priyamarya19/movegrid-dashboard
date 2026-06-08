import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import RidersChart from "@/components/charts/RidersChart";
import VehicleDonut from "@/components/charts/VehicleDonut";
import PendingPayoutsWidget from "@/components/home/PendingPayoutsWidget";

type Props = { role: string; name: string };

const getStats = unstable_cache(async function getStats() {
  const [vehicles, riders, rentMTD, onboardMTD, securityMTD, totalCollected, totalInvestments, payoutsDone, payoutsPending] = await Promise.all([
    pool.query(`SELECT status, COUNT(*) FROM ${schemas.ops}.vehicles GROUP BY status`),
    pool.query(`SELECT status, COUNT(*) FROM ${schemas.ops}.riders GROUP BY status`),
    pool.query(`SELECT COALESCE(SUM(amount_collected),0) AS total FROM ${schemas.ops}.rider_payments WHERE DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(onboarding_fee),0) AS total FROM ${schemas.ops}.riders WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(security_deposit),0) AS total FROM ${schemas.ops}.riders WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`),
    pool.query(`SELECT COALESCE(SUM(amount_collected),0) AS total FROM ${schemas.ops}.rider_payments`),
    pool.query(`SELECT COALESCE(SUM(total_invested),0) AS total FROM ${schemas.ops}.investor_profiles`),
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM ${schemas.ops}.investor_payouts WHERE status = 'paid'`),
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM ${schemas.ops}.investor_payouts WHERE status = 'pending'`),
  ]);

  const vMap: Record<string, number> = {};
  vehicles.rows.forEach((r: { status: string; count: string }) => { vMap[r.status] = Number(r.count); });
  const totalVehicles = Object.values(vMap).reduce((a, b) => a + b, 0);

  const rMap: Record<string, number> = {};
  riders.rows.forEach((r: { status: string; count: string }) => { rMap[r.status] = Number(r.count); });

  return {
    assignedVehicles: vMap["assigned"] ?? 0,
    availableVehicles: vMap["available"] ?? 0,
    maintenanceVehicles: vMap["maintenance"] ?? 0,
    totalVehicles,
    activeRiders: rMap["active"] ?? 0,
    inactiveRiders: rMap["inactive"] ?? 0,
    pendingRiders: rMap["pending"] ?? 0,
    rentMTD: Number(rentMTD.rows[0].total),
    onboardMTD: Number(onboardMTD.rows[0].total),
    securityMTD: Number(securityMTD.rows[0].total),
    totalCollected: Number(totalCollected.rows[0].total),
    totalInvestments: Number(totalInvestments.rows[0].total),
    payoutsDone: Number(payoutsDone.rows[0].total),
    payoutsPending: Number(payoutsPending.rows[0].total),
  };
}, ["admin-stats-v3"], { revalidate: 60 });

const getMonthlyOnboarding = unstable_cache(async function getMonthlyOnboarding() {
  const res = await pool.query(`
    SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YY') AS label,
           COUNT(*) AS count
    FROM ${schemas.ops}.riders
    GROUP BY DATE_TRUNC('month', created_at), label
    ORDER BY DATE_TRUNC('month', created_at) ASC
    LIMIT 8
  `);
  return res.rows.map((r: { label: string; count: string }) => ({ label: r.label, count: Number(r.count) }));
}, ["admin-onboarding-v1"], { revalidate: 300 });

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

const getPendingPayouts = unstable_cache(async function getPendingPayouts() {
  const res = await pool.query(`
    SELECT pay.id, u.name AS investor_name, pay.amount, pay.due_date, v.ev_number
    FROM ${schemas.ops}.investor_payouts pay
    JOIN ${schemas.ops}.investor_profiles ip ON ip.id = pay.investor_id
    JOIN ${schemas.auth}.users u ON u.id = ip.user_id
    LEFT JOIN ${schemas.ops}.vehicles v ON v.id = pay.vehicle_id
    WHERE pay.status = 'pending'
    ORDER BY pay.due_date ASC
    LIMIT 10
  `);
  return res.rows;
}, ["admin-pending-payouts"], { revalidate: 30 });

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
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
      case "onboard_rider": return d.name ? <>Rider <strong>{String(d.name)}</strong> onboarded</> : <>Rider onboarded</>;
      case "assign_vehicle": return d.vehicle ? <>Vehicle <strong>{String(d.vehicle)}</strong> assigned</> : <>Vehicle assigned</>;
      case "record_payment": return d.amount ? <>Payment <strong>{fmt(Number(d.amount))}</strong>{d.rider ? <> · {String(d.rider)}</> : ""}</> : <>Payment recorded</>;
      case "update_lead": return d.name ? <>Lead <strong>{String(d.name)}</strong> → {d.status ? String(d.status) : "updated"}</> : <>Lead updated</>;
      case "payout_marked": return d.amount ? <>Payout <strong>{fmt(Number(d.amount))}</strong> marked paid</> : <>Payout marked paid</>;
      case "new_lead": return d.name ? <>New lead: <strong>{String(d.name)}</strong></> : <>New lead</>;
      default: return <>{actionLabel[log.action] ?? log.action.replace(/_/g, " ")}</>;
    }
  } catch { return <>{actionLabel[log.action] ?? log.action.replace(/_/g, " ")}</>; }
}

export default async function AdminHome({ role, name }: Props) {
  const [stats, onboardingData, leads, logs, pendingPayouts, revenueSummary] = await Promise.all([
    getStats(), getMonthlyOnboarding(), getRecentLeads(), getAuditLogs(), getPendingPayouts(), getRevenueSummary(),
  ]);

  const currentMonth = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const roleLabel: Record<string, string> = { admin: "Admin", ops_manager: "Ops Manager", hub_incharge: "Hub Incharge" };

  return (
    <div>
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-4 lg:px-7 lg:py-5 border-b border-[#1e1e2e] bg-[#0A0A0F] sticky top-0 z-10">
        <div>
          <h2 className="text-lg font-semibold text-white">Good morning, {name} 👋</h2>
          <p className="text-[#666] text-sm mt-0.5">Business overview — {currentMonth}</p>
        </div>
        <span className="text-xs text-gray-500 uppercase tracking-wider">{roleLabel[role] ?? role}</span>
      </div>

      <div className="p-4 lg:p-7 space-y-6">

        {/* Row 1 — Fleet & Riders */}
        <div>
          <p className="text-[11px] text-[#555] uppercase tracking-widest mb-3">Fleet & Riders</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Deployed", value: stats.assignedVehicles, sub: `of ${stats.totalVehicles} total`, accent: "#00D1B2", href: "/vehicles?status=assigned" },
              { label: "Available", value: stats.availableVehicles, sub: "ready to deploy", accent: "#a29bfe", href: "/vehicles?status=available" },
              { label: "Maintenance", value: stats.maintenanceVehicles, sub: "under service", accent: "#fdcb6e", href: "/vehicles?status=maintenance" },
              { label: "Active Riders", value: stats.activeRiders, sub: `${stats.pendingRiders} pending KYC`, accent: "#6C5CE7", href: "/riders?status=active" },
            ].map((c) => (
              <Link key={c.label} href={c.href} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5 relative overflow-hidden hover:border-[#333] hover:bg-[#16161f] transition-colors block">
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: c.accent }} />
                <p className="text-[11px] text-[#666] uppercase tracking-wider mb-2">{c.label}</p>
                <p className="text-[28px] font-bold text-white mb-1" style={{ color: c.accent }}>{c.value}</p>
                <p className="text-[11px] text-[#555]">{c.sub}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Row 2 — Money */}
        <div>
          <p className="text-[11px] text-[#555] uppercase tracking-widest mb-3">Financials</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Rent This Month", value: fmt(stats.rentMTD), sub: `+${fmt(stats.onboardMTD)} onboarding`, accent: "#00D1B2", href: "/riders" },
              { label: "Total Collected", value: fmt(stats.totalCollected), sub: "all time rent", accent: "#6C5CE7", href: "/riders" },
              { label: "Total Investment", value: fmt(stats.totalInvestments), sub: `${fmt(stats.payoutsDone)} paid out`, accent: "#fdcb6e", href: "/investors" },
              { label: "Payouts Pending", value: fmt(stats.payoutsPending), sub: "to investors", accent: stats.payoutsPending > 0 ? "#ff6b6b" : "#555", href: "/investors" },
            ].map((c) => (
              <Link key={c.label} href={c.href} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5 relative overflow-hidden hover:border-[#333] hover:bg-[#16161f] transition-colors block">
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: c.accent }} />
                <p className="text-[11px] text-[#666] uppercase tracking-wider mb-2">{c.label}</p>
                <p className="text-[24px] font-bold mb-1" style={{ color: c.accent }}>{c.value}</p>
                <p className="text-[11px] text-[#555]">{c.sub}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Charts: Onboarding trend + Vehicle donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <p className="text-sm font-semibold text-white mb-1">Riders Onboarded</p>
            <p className="text-xs text-[#555] mb-4">Monthly trend</p>
            <RidersChart data={onboardingData} />
          </div>

          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <p className="text-sm font-semibold text-white mb-1">Fleet Allocation</p>
            <p className="text-xs text-[#555] mb-4">{stats.totalVehicles} total vehicles</p>
            <VehicleDonut assigned={stats.assignedVehicles} available={stats.availableVehicles} maintenance={stats.maintenanceVehicles} />
            <div className="mt-4 space-y-2">
              {[
                { label: "Deployed", color: "#00D1B2", val: stats.assignedVehicles, pct: stats.totalVehicles ? Math.round(stats.assignedVehicles / stats.totalVehicles * 100) : 0 },
                { label: "Available", color: "#a29bfe", val: stats.availableVehicles, pct: stats.totalVehicles ? Math.round(stats.availableVehicles / stats.totalVehicles * 100) : 0 },
                { label: "Maintenance", color: "#fdcb6e", val: stats.maintenanceVehicles, pct: stats.totalVehicles ? Math.round(stats.maintenanceVehicles / stats.totalVehicles * 100) : 0 },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 text-sm">
                  <span className="w-20 text-xs shrink-0" style={{ color: row.color }}>{row.label}</span>
                  <div className="flex-1 h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                  <span className="w-6 text-right text-white font-semibold text-xs shrink-0">{row.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue Summary */}
        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
          <p className="text-sm font-semibold text-white mb-1">Revenue Summary</p>
          <p className="text-xs text-[#555] mb-4">Monthly breakdown — collected vs paid out vs net</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  {[
                    { label: "Month", color: "#555" },
                    { label: "Rent", color: "#00D1B2" },
                    { label: "Onboarding", color: "#6C5CE7" },
                    { label: "Security", color: "#a29bfe" },
                    { label: "Investor Payouts", color: "#e17055" },
                    { label: "Net", color: "#fff" },
                  ].map(h => (
                    <th key={h.label} className="text-left pb-3 text-[11px] uppercase tracking-wider whitespace-nowrap" style={{ color: h.color }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revenueSummary.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-[#555]">No revenue data yet</td></tr>
                ) : revenueSummary.map((row: { month: string; rent: number; onboard: number; security: number; payouts: number }, i: number) => {
                  const net = Number(row.rent) + Number(row.onboard) + Number(row.security) - Number(row.payouts);
                  return (
                    <tr key={row.month} className="border-b border-[#1a1a2a]">
                      <td className={`py-2.5 ${i === 0 ? "font-bold text-white" : "text-[#ccc]"}`}>{row.month}</td>
                      <td className="py-2.5 text-[#00D1B2]">{fmt(Number(row.rent))}</td>
                      <td className="py-2.5 text-[#6C5CE7]">{fmt(Number(row.onboard))}</td>
                      <td className="py-2.5 text-[#a29bfe]">{fmt(Number(row.security))}</td>
                      <td className="py-2.5 text-[#e17055]">{Number(row.payouts) > 0 ? `−${fmt(Number(row.payouts))}` : "—"}</td>
                      <td className={`py-2.5 font-bold ${i === 0 ? "text-[#00D1B2]" : "text-white"}`}>{fmt(net)}</td>
                    </tr>
                  );
                })}
                {revenueSummary.length > 0 && (() => {
                  const ytdRent = revenueSummary.reduce((s: number, r: { rent: number }) => s + Number(r.rent), 0);
                  const ytdOnboard = revenueSummary.reduce((s: number, r: { onboard: number }) => s + Number(r.onboard), 0);
                  const ytdSecurity = revenueSummary.reduce((s: number, r: { security: number }) => s + Number(r.security), 0);
                  const ytdPayouts = revenueSummary.reduce((s: number, r: { payouts: number }) => s + Number(r.payouts), 0);
                  return (
                    <tr className="border-t-2 border-[#6C5CE740]">
                      <td className="py-2.5 font-bold text-[#6C5CE7]">YTD</td>
                      <td className="py-2.5 font-bold text-[#00D1B2]">{fmt(ytdRent)}</td>
                      <td className="py-2.5 font-bold text-[#6C5CE7]">{fmt(ytdOnboard)}</td>
                      <td className="py-2.5 font-bold text-[#a29bfe]">{fmt(ytdSecurity)}</td>
                      <td className="py-2.5 font-bold text-[#e17055]">{ytdPayouts > 0 ? `−${fmt(ytdPayouts)}` : "—"}</td>
                      <td className="py-2.5 font-bold text-[#00D1B2] text-[15px]">{fmt(ytdRent + ytdOnboard + ytdSecurity - ytdPayouts)}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Investor Payouts */}
        <PendingPayoutsWidget initialPayouts={pendingPayouts} />

        {/* Recent Leads + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Recent Leads</p>
              <Link href="/leads" className="text-xs text-[#6C5CE7] hover:underline">View all →</Link>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  {["Name", "Type", "Phone", "Status"].map(h => (
                    <th key={h} className="text-left pb-3 text-[11px] text-[#555] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-[#555]">No leads yet</td></tr>
                ) : leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02]">
                    <td className="py-2.5">
                      <Link href={`/leads/${lead.id}`} className="text-[#ccc] hover:text-white hover:underline">{lead.name}</Link>
                    </td>
                    <td className={`py-2.5 font-medium capitalize ${typeColor[lead.type] ?? "text-gray-400"}`}>{lead.type}</td>
                    <td className="py-2.5 text-[#ccc]">{lead.phone ?? "—"}</td>
                    <td className="py-2.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusColor[lead.status] ?? "bg-gray-500/20 text-gray-400"}`}>{lead.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white">Recent Activity</p>
              <Link href="/logs" className="text-xs text-[#6C5CE7] hover:underline">View logs →</Link>
            </div>
            <div className="space-y-0">
              {logs.length === 0 ? (
                <p className="text-[#555] text-sm py-4 text-center">No activity yet</p>
              ) : logs.map((log, i) => (
                <div key={i} className="flex gap-3 items-start py-2.5 border-b border-[#1a1a2a] last:border-0">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dotColor[log.action] ?? "#666" }} />
                  <div className="min-w-0">
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
