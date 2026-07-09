import { notFound } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import BackButton from "@/components/BackButton";
import { getSession } from "@/lib/auth";
import MapVehiclesPanel from "@/components/investors/MapVehiclesPanel";
import RecordPayoutModal from "@/components/investors/RecordPayoutModal";
import { vehicleStatusColor, vehicleStatusLabel } from "@/lib/vehicleStatus";

async function getData(id: string) {
  const [investor, vehicles, payouts] = await Promise.all([
    pool.query(`
      SELECT ip.*, u.name, u.email, u.mobile
      FROM ${schemas.ops}.investor_profiles ip
      JOIN ${schemas.auth}.users u ON u.id = ip.user_id
      WHERE ip.id = $1
    `, [id]),

    pool.query(`
      SELECT v.id, v.ev_number, v.status,
             m.model_name, m.oem,
             h.hub_name,
             r.name AS assigned_rider, r.id AS rider_id
      FROM ${schemas.ops}.vehicles v
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = v.hub_id
      LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.vehicle_id = v.id AND rva.status = 'active'
      LEFT JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
      WHERE v.investor_id = $1
      ORDER BY v.ev_number
    `, [id]),

    pool.query(`
      SELECT pay.amount, pay.due_date, pay.paid_date, pay.status, pay.period_month, pay.proof_url, v.ev_number
      FROM ${schemas.ops}.investor_payouts pay
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = pay.vehicle_id
      WHERE pay.investor_id = $1
      ORDER BY COALESCE(pay.period_month, pay.due_date) DESC
    `, [id]),
  ]);

  if (!investor.rows[0]) return null;

  const totalPaid = payouts.rows
    .filter((p: { status: string }) => p.status === "paid")
    .reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
  const totalPending = payouts.rows
    .filter((p: { status: string }) => p.status === "pending")
    .reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);

  return { investor: investor.rows[0], vehicles: vehicles.rows, payouts: payouts.rows, totalPaid, totalPending };
}

const payoutStatus: Record<string, string> = {
  paid: "bg-accent-success/20 text-accent-success-text",
  pending: "bg-accent-warning/20 text-accent-warning-text",
  delayed: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

export default async function InvestorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, session] = await Promise.all([getData(id), getSession()]);
  if (!data) notFound();

  const { investor, vehicles, payouts, totalPaid, totalPending } = data;
  const roi = investor.total_invested > 0 ? ((totalPaid / investor.total_invested) * 100).toFixed(1) : "0";
  const isAdmin = session?.role === "admin";

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <BackButton fallback="/investors" label="Investors" />
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">{investor.name}</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-primary text-2xl font-bold">{investor.name}</h1>
            <p className="text-muted text-sm mt-1">{investor.mobile} · {investor.email}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${investor.status === "active" ? "bg-accent-success/20 text-accent-success-text" : "bg-muted/20 text-muted"}`}>{investor.status}</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Invested", value: "₹" + Number(investor.total_invested).toLocaleString(), color: "var(--accent-purple)" },
            { label: "Total Paid Out", value: "₹" + Number(totalPaid).toLocaleString(), color: "var(--accent-teal)" },
            { label: "Pending Payouts", value: "₹" + Number(totalPending).toLocaleString(), color: "var(--accent-danger)" },
            { label: "ROI So Far", value: roi + "%", color: "var(--accent-warning)" },
          ].map((c) => (
            <div key={c.label} className="bg-surface border border-default rounded-xl p-5">
              <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
              <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-default rounded-xl p-5">
            <h2 className="text-primary font-semibold mb-4">Investor Details</h2>
            {[
              { label: "Name", value: investor.name },
              { label: "Mobile", value: investor.mobile },
              { label: "Email", value: investor.email },
              { label: "PAN", value: investor.pan ?? "—" },
              { label: "Aadhaar", value: investor.aadhaar ? "XXXX XXXX " + investor.aadhaar.slice(-4) : "—" },
              { label: "Bank", value: investor.bank ?? "—" },
              { label: "Investment Date", value: investor.investment_date ? new Date(investor.investment_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2 border-b border-default last:border-0">
                <span className="text-muted text-sm">{row.label}</span>
                <span className="text-secondary text-sm">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="bg-surface border border-default rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-default flex items-center justify-between gap-3">
              <h2 className="text-primary font-semibold">Vehicles Owned ({vehicles.length})</h2>
              {isAdmin && <MapVehiclesPanel investorId={investor.id} />}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default">
                  {["EV No.", "Model", "Hub", "Rider", "Status"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">No vehicles</td></tr>
                ) : vehicles.map((v: { id: string; ev_number: string; model_name: string; oem: string; hub_name: string; rider_id: string; assigned_rider: string; status: string }) => (
                  <tr key={v.id} className="border-b border-subtle hover:bg-overlay-hover">
                    <td className="px-5 py-3">
                      <Link href={`/vehicles/${v.id}`} className="text-accent-purple hover:underline font-medium">{v.ev_number}</Link>
                    </td>
                    <td className="px-5 py-3 text-secondary text-xs">{v.model_name}</td>
                    <td className="px-5 py-3 text-secondary text-xs">{v.hub_name ?? "—"}</td>
                    <td className="px-5 py-3">
                      {v.rider_id ? (
                        <Link href={`/riders/${v.rider_id}`} className="text-accent-warning hover:underline text-xs">{v.assigned_rider}</Link>
                      ) : <span className="text-muted text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${vehicleStatusColor[v.status] ?? "bg-muted/20 text-muted"}`}>{vehicleStatusLabel(v.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-default rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-default flex items-center justify-between gap-3">
            <h2 className="text-primary font-semibold">Payout History</h2>
            {isAdmin && <RecordPayoutModal investorId={investor.id} vehicles={vehicles.map((v: { id: string; ev_number: string }) => ({ id: v.id, ev_number: v.ev_number }))} />}
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Month", "Vehicle", "Paid Date", "Amount", "Status", "Receipt"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted">No payouts yet</td></tr>
              ) : payouts.map((p: { ev_number: string; due_date: string; paid_date: string; amount: number; status: string; period_month: string | null; proof_url: string | null }, i: number) => (
                <tr key={i} className="border-b border-subtle">
                  <td className="px-5 py-3 text-secondary">{(p.period_month ?? p.due_date) ? new Date(p.period_month ?? p.due_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3 text-accent-purple">{p.ev_number ?? "—"}</td>
                  <td className="px-5 py-3 text-secondary">{p.paid_date ? new Date(p.paid_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3 text-accent-teal font-semibold">₹{Number(p.amount).toLocaleString()}</td>
                  <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs capitalize ${payoutStatus[p.status] ?? "bg-muted/20 text-muted"}`}>{p.status}</span></td>
                  <td className="px-5 py-3">
                    {p.proof_url ? (
                      <a href={`/api/file?key=${encodeURIComponent(p.proof_url)}`} target="_blank" rel="noopener noreferrer" className="text-accent-purple hover:underline text-xs">View</a>
                    ) : <span className="text-muted text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
