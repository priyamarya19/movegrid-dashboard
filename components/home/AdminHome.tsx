import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import RidersChart from "@/components/charts/RidersChart";
import VehicleDonut from "@/components/charts/VehicleDonut";
import PendingPayoutsWidget from "@/components/home/PendingPayoutsWidget";
import { getLedgerSummary } from "@/lib/rent";
import { getFleetRiderCounts } from "@/lib/fleetStats";
import { getFinancialStats } from "@/lib/financialStats";
import { VSTATUS, NOT_AVAILABLE } from "@/lib/vehicleStatus";
import { inrCompact, timeAgo, greeting, dateIN } from "@/lib/format";

type Props = { role: string; name: string };

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

const statusColor: Record<string, string> = {
  new: "bg-accent-purple/13 text-accent-purple",
  contacted: "bg-accent-teal/13 text-accent-teal",
  converted: "bg-accent-success/13 text-accent-success",
  rejected: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

const typeColor: Record<string, string> = {
  investor: "text-accent-teal",
  rider: "text-accent-purple",
  fleet: "text-accent-warning",
};

const dotColor: Record<string, string> = {
  onboard_rider: "var(--accent-teal)",
  assign_vehicle: "var(--accent-purple)",
  record_payment: "var(--accent-warning)",
  update_lead: "var(--accent-danger)",
  payout_marked: "var(--accent-purple-2)",
  new_lead: "var(--accent-teal)",
};

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
      case "record_payment": return d.amount ? <>Payment <strong>{inrCompact(Number(d.amount))}</strong>{d.rider ? <> · {String(d.rider)}</> : ""}</> : <>Payment recorded</>;
      case "update_lead": return d.name ? <>Lead <strong>{String(d.name)}</strong> → {d.status ? String(d.status) : "updated"}</> : <>Lead updated</>;
      case "payout_marked": return d.amount ? <>Payout <strong>{inrCompact(Number(d.amount))}</strong> marked paid</> : <>Payout marked paid</>;
      case "new_lead": return d.name ? <>New lead: <strong>{String(d.name)}</strong></> : <>New lead</>;
      default: return <>{actionLabel[log.action] ?? log.action.replace(/_/g, " ")}</>;
    }
  } catch { return <>{actionLabel[log.action] ?? log.action.replace(/_/g, " ")}</>; }
}

export default async function AdminHome({ role, name }: Props) {
  const [fleet, financial, onboardingData, leads, logs, pendingPayouts, revenueSummary, ledger] = await Promise.all([
    getFleetRiderCounts(), getFinancialStats(), getMonthlyOnboarding(), getRecentLeads(), getAuditLogs(), getPendingPayouts(), getRevenueSummary(), getLedgerSummary(),
  ]);
  const stats = { ...fleet, ...financial };
  // Single source: same ledger figures used by Ops & Investor dashboards.
  const collection = { collected: ledger.collected, expected: ledger.expectedToDate, pending: ledger.overdue, pct: ledger.pct };

  const currentMonth = dateIN(new Date(), { month: "long", year: "numeric" });
  const pctColor = collection.pct >= 80 ? "var(--accent-teal)" : collection.pct >= 50 ? "var(--accent-warning)" : "var(--accent-danger-alt)";
  const roleLabel: Record<string, string> = { admin: "Admin", ops_manager: "Ops Manager", hub_incharge: "Hub Incharge" };

  return (
    <div>
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-4 lg:px-7 lg:py-5 border-b border-default bg-base">
        <div>
          <h2 className="text-lg font-semibold text-primary">{greeting()}, {name} 👋</h2>
          <p className="text-muted text-sm mt-0.5">Business overview — {currentMonth}</p>
        </div>
        <span className="text-xs text-muted uppercase tracking-wider">{roleLabel[role] ?? role}</span>
      </div>

      <div className="p-4 lg:p-7 space-y-6">

        {/* Row 1 — Fleet & Riders */}
        <div>
          <p className="text-[11px] text-muted uppercase tracking-widest mb-3">Fleet & Riders</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Deployed", value: stats.assignedVehicles, sub: `of ${stats.totalVehicles} total`, accent: "var(--accent-teal)", href: "/vehicles?status=assigned" },
              { label: "Available", value: stats.availableVehicles, sub: "ready to deploy", accent: "var(--accent-purple-2)", href: `/vehicles?status=${VSTATUS.available}` },
              { label: "Not Available", value: stats.notAvailableVehicles, sub: "maintenance, returned, etc.", accent: "var(--accent-warning)", href: `/vehicles?status=${NOT_AVAILABLE}` },
              { label: "Available Riders", value: stats.pendingRiders, sub: "not yet allotted a vehicle", accent: "var(--accent-purple)", href: "/riders?status=pending" },
            ].map((c) => (
              <Link key={c.label} href={c.href} className="bg-surface border border-default rounded-xl p-5 relative overflow-hidden hover:border-strong hover:bg-surface-hover transition-colors block">
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: c.accent }} />
                <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
                <p className="text-[28px] font-bold text-primary mb-1" style={{ color: c.accent }}>{c.value}</p>
                <p className="text-[11px] text-muted">{c.sub}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Row 2 — Money */}
        <div>
          <p className="text-[11px] text-muted uppercase tracking-widest mb-3">Financials</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Rent This Month", value: inrCompact(stats.rentMTD), sub: `+${inrCompact(stats.onboardMTD)} onboarding`, accent: "var(--accent-teal)", href: "/riders" },
              { label: "Total Collected", value: inrCompact(stats.totalCollected), sub: "all time rent", accent: "var(--accent-purple)", href: "/riders" },
              { label: "Total Investment", value: inrCompact(stats.totalInvestments), sub: `${inrCompact(stats.payoutsDone)} paid out`, accent: "var(--accent-warning)", href: "/investors" },
              { label: "Payouts Pending", value: inrCompact(stats.payoutsPending), sub: "to investors", accent: stats.payoutsPending > 0 ? "var(--accent-danger-alt)" : "var(--text-muted)", href: "/investors" },
            ].map((c) => (
              <Link key={c.label} href={c.href} className="bg-surface border border-default rounded-xl p-5 relative overflow-hidden hover:border-strong hover:bg-surface-hover transition-colors block">
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: c.accent }} />
                <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
                <p className="text-[24px] font-bold mb-1" style={{ color: c.accent }}>{c.value}</p>
                <p className="text-[11px] text-muted">{c.sub}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Rent Collection — collected vs expected (MTD) */}
        <div>
          <p className="text-[11px] text-muted uppercase tracking-widest mb-3">Rent Collection — to date</p>
          <div className="bg-surface border border-default rounded-xl p-5">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <p className="text-[11px] text-muted uppercase tracking-wider mb-1">Collected</p>
                <p className="text-[28px] font-bold text-accent-teal">{inrCompact(collection.collected)}</p>
              </div>
              <Link href="/collections" className="group" title="See which riders' rent is pending">
                <p className="text-[11px] text-muted group-hover:text-accent-purple-2 uppercase tracking-wider mb-1">Expected ↗</p>
                <p className="text-[28px] font-bold text-accent-purple-2 group-hover:underline">{inrCompact(collection.expected)}</p>
              </Link>
              <Link href="/collections" className="group" title="See which riders' rent is pending">
                <p className="text-[11px] text-muted uppercase tracking-wider mb-1">Pending ↗</p>
                <p className="text-[28px] font-bold text-accent-danger-alt group-hover:underline">{inrCompact(collection.pending)}</p>
              </Link>
              <Link href="/riders/pending-week" className="group" title="Riders whose current week's rent is unpaid">
                <p className="text-[11px] text-muted group-hover:text-accent-teal uppercase tracking-wider mb-1">This Week ↗</p>
                <p className="text-[28px] font-bold text-accent-teal group-hover:underline">{inrCompact(ledger.pendingThisWeek)}</p>
                <p className="text-[11px] text-muted">{ledger.pendingThisWeekRiders} rider{ledger.pendingThisWeekRiders !== 1 ? "s" : ""}</p>
              </Link>
              <div className="ml-auto text-right">
                <p className="text-[11px] text-muted uppercase tracking-wider mb-1">Collection</p>
                <p className="text-[28px] font-bold" style={{ color: pctColor }}>{collection.pct}%</p>
              </div>
            </div>
            <div className="mt-4 h-2 bg-default rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(collection.pct, 100)}%`, background: pctColor }} />
            </div>
            <p className="text-[11px] text-muted mt-2">From the rent ledger (all roles see this same figure) · click <span className="text-accent-purple-2">Expected</span> or <span className="text-accent-danger-alt">Pending</span> to see who owes rent</p>
          </div>
        </div>

        {/* Charts: Onboarding trend + Vehicle donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-surface border border-default rounded-xl p-5">
            <p className="text-sm font-semibold text-primary mb-1">Riders Onboarded</p>
            <p className="text-xs text-muted mb-4">Monthly trend</p>
            <RidersChart data={onboardingData} />
          </div>

          <div className="bg-surface border border-default rounded-xl p-5">
            <p className="text-sm font-semibold text-primary mb-1">Fleet Allocation</p>
            <p className="text-xs text-muted mb-4">{stats.totalVehicles} total vehicles</p>
            <VehicleDonut assigned={stats.assignedVehicles} available={stats.availableVehicles} notAvailable={stats.notAvailableVehicles} />
            <div className="mt-4 space-y-2">
              {[
                { label: "Deployed", color: "var(--accent-teal)", val: stats.assignedVehicles, pct: stats.totalVehicles ? Math.round(stats.assignedVehicles / stats.totalVehicles * 100) : 0 },
                { label: "Available", color: "var(--accent-purple-2)", val: stats.availableVehicles, pct: stats.totalVehicles ? Math.round(stats.availableVehicles / stats.totalVehicles * 100) : 0 },
                { label: "Not Available", color: "var(--accent-warning)", val: stats.notAvailableVehicles, pct: stats.totalVehicles ? Math.round(stats.notAvailableVehicles / stats.totalVehicles * 100) : 0 },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 text-sm">
                  <span className="w-20 text-xs shrink-0" style={{ color: row.color }}>{row.label}</span>
                  <div className="flex-1 h-1.5 bg-default rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                  <span className="w-6 text-right text-primary font-semibold text-xs shrink-0">{row.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue Summary */}
        <div className="bg-surface border border-default rounded-xl p-5">
          <p className="text-sm font-semibold text-primary mb-1">Revenue Summary</p>
          <p className="text-xs text-muted mb-4">Monthly breakdown — collected vs paid out vs net</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-default">
                  {[
                    { label: "Month", color: "var(--text-muted)" },
                    { label: "Rent", color: "var(--accent-teal)" },
                    { label: "Onboarding", color: "var(--accent-purple)" },
                    { label: "Security", color: "var(--accent-purple-2)" },
                    { label: "Investor Payouts", color: "var(--accent-danger)" },
                    { label: "Net", color: "var(--text-primary)" },
                  ].map(h => (
                    <th key={h.label} className="text-left pb-3 text-[11px] uppercase tracking-wider whitespace-nowrap" style={{ color: h.color }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revenueSummary.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-muted">No revenue data yet</td></tr>
                ) : revenueSummary.map((row: { month: string; rent: number; onboard: number; security: number; payouts: number }, i: number) => {
                  const net = Number(row.rent) + Number(row.onboard) + Number(row.security) - Number(row.payouts);
                  return (
                    <tr key={row.month} className="border-b border-subtle">
                      <td className={`py-2.5 ${i === 0 ? "font-bold text-primary" : "text-secondary"}`}>{row.month}</td>
                      <td className="py-2.5 text-accent-teal">{inrCompact(Number(row.rent))}</td>
                      <td className="py-2.5 text-accent-purple">{inrCompact(Number(row.onboard))}</td>
                      <td className="py-2.5 text-accent-purple-2">{inrCompact(Number(row.security))}</td>
                      <td className="py-2.5 text-accent-danger">{Number(row.payouts) > 0 ? `−${inrCompact(Number(row.payouts))}` : "—"}</td>
                      <td className={`py-2.5 font-bold ${i === 0 ? "text-accent-teal" : "text-primary"}`}>{inrCompact(net)}</td>
                    </tr>
                  );
                })}
                {revenueSummary.length > 0 && (() => {
                  const ytdRent = revenueSummary.reduce((s: number, r: { rent: number }) => s + Number(r.rent), 0);
                  const ytdOnboard = revenueSummary.reduce((s: number, r: { onboard: number }) => s + Number(r.onboard), 0);
                  const ytdSecurity = revenueSummary.reduce((s: number, r: { security: number }) => s + Number(r.security), 0);
                  const ytdPayouts = revenueSummary.reduce((s: number, r: { payouts: number }) => s + Number(r.payouts), 0);
                  return (
                    <tr className="border-t-2 border-accent-purple/25">
                      <td className="py-2.5 font-bold text-accent-purple">YTD</td>
                      <td className="py-2.5 font-bold text-accent-teal">{inrCompact(ytdRent)}</td>
                      <td className="py-2.5 font-bold text-accent-purple">{inrCompact(ytdOnboard)}</td>
                      <td className="py-2.5 font-bold text-accent-purple-2">{inrCompact(ytdSecurity)}</td>
                      <td className="py-2.5 font-bold text-accent-danger">{ytdPayouts > 0 ? `−${inrCompact(ytdPayouts)}` : "—"}</td>
                      <td className="py-2.5 font-bold text-accent-teal text-[15px]">{inrCompact(ytdRent + ytdOnboard + ytdSecurity - ytdPayouts)}</td>
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
          <div className="bg-surface border border-default rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-primary">Recent Leads</p>
              <Link href="/leads" className="text-xs text-accent-purple hover:underline">View all →</Link>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-default">
                  {["Name", "Type", "Phone", "Status"].map(h => (
                    <th key={h} className="text-left pb-3 text-[11px] text-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-muted">No leads yet</td></tr>
                ) : leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-subtle hover:bg-overlay-hover">
                    <td className="py-2.5">
                      <Link href={`/leads/${lead.id}`} className="text-secondary hover:text-primary hover:underline">{lead.name}</Link>
                    </td>
                    <td className={`py-2.5 font-medium capitalize ${typeColor[lead.type] ?? "text-muted"}`}>{lead.type}</td>
                    <td className="py-2.5 text-secondary">{lead.phone ?? "—"}</td>
                    <td className="py-2.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusColor[lead.status] ?? "bg-muted/20 text-muted"}`}>{lead.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <div className="bg-surface border border-default rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-primary">Recent Activity</p>
              <Link href="/logs" className="text-xs text-accent-purple hover:underline">View logs →</Link>
            </div>
            <div className="space-y-0">
              {logs.length === 0 ? (
                <p className="text-muted text-sm py-4 text-center">No activity yet</p>
              ) : logs.map((log, i) => (
                <div key={i} className="flex gap-3 items-start py-2.5 border-b border-subtle last:border-0">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dotColor[log.action] ?? "var(--text-muted)" }} />
                  <div className="min-w-0">
                    <p className="text-sm text-secondary leading-snug">{activityText(log)}</p>
                    <p className="text-[11px] text-muted mt-0.5">{timeAgo(log.created_at)}</p>
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
