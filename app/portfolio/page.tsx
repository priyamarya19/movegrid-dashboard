import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { getSession } from "@/lib/auth";
import { getPortfolioByUser } from "@/lib/portfolio";
import { maskMobile, maskAadhaar } from "@/lib/mask";
import RevealNumberButton from "@/components/investors/RevealNumberButton";
import { vehicleStatusColor, vehicleStatusLabel } from "@/lib/vehicleStatus";

const payoutStatus: Record<string, string> = {
  paid: "bg-accent-success/20 text-accent-success-text",
  pending: "bg-accent-warning/20 text-accent-warning-text",
  delayed: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function PortfolioPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "investor") redirect("/");

  const portfolio = await getPortfolioByUser(session.userId);

  return (
    <DashboardLayout allowedRoles={["investor"]}>
      {!portfolio ? (
        <div className="bg-surface border border-default rounded-2xl p-10 text-center">
          <p className="text-secondary">Your investor profile isn&apos;t set up yet.</p>
          <p className="text-muted text-sm mt-1">Please contact the MoveGrid team to get started.</p>
        </div>
      ) : (
        <PortfolioView portfolio={portfolio} name={session.name} />
      )}
    </DashboardLayout>
  );
}

function PortfolioView({
  portfolio,
  name,
}: {
  portfolio: NonNullable<Awaited<ReturnType<typeof getPortfolioByUser>>>;
  name: string;
}) {
  const { profile, vehicles, payouts, totalPaid, roi, payoutsMade, payoutsRemaining, termMonths } = portfolio;

  const sinceMonth = profile.investment_date
    ? new Date(profile.investment_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;

  const cards = [
    { label: "Total Invested", value: "₹" + Number(profile.total_invested).toLocaleString(), color: "var(--accent-purple)", sub: sinceMonth ? "Since " + sinceMonth : undefined },
    { label: "Earned So Far", value: "₹" + Number(totalPaid).toLocaleString(), color: "var(--accent-teal)", sub: `${payoutsMade} of ${termMonths} payouts received` },
    { label: "Payouts Remaining", value: String(payoutsRemaining), color: "var(--accent-danger)", sub: `of ${termMonths} months` },
    { label: "ROI So Far", value: roi.toFixed(1) + "%", color: "var(--accent-warning)", sub: undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-primary text-2xl font-bold">My Portfolio</h1>
          <p className="text-muted text-sm mt-1">
            {name} · Investing since {fmtDate(profile.investment_date)}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${profile.status === "active" ? "bg-accent-success/20 text-accent-success-text" : "bg-muted/20 text-muted"}`}>
          {profile.status}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface border border-default rounded-xl p-5">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            {c.sub && <p className="text-muted text-xs mt-1">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Vehicles */}
      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-default">
          <h2 className="text-primary font-semibold">My Vehicles ({vehicles.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["EV No.", "Model", "Hub", "Rider", "Mobile No.", "Aadhaar", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted">No vehicles assigned yet</td></tr>
              ) : vehicles.map((v) => (
                <tr key={v.id} className="border-b border-subtle hover:bg-overlay-hover">
                  <td className="px-5 py-3 text-accent-purple font-medium">{v.ev_number}</td>
                  <td className="px-5 py-3 text-secondary text-xs">{v.model_name ?? "—"}</td>
                  <td className="px-5 py-3 text-secondary text-xs">{v.hub_name ?? "—"}</td>
                  <td className="px-5 py-3 text-accent-warning text-xs">{v.assigned_rider ?? "—"}</td>
                  <td className="px-5 py-3 text-xs">
                    <RevealNumberButton vehicleId={v.id} riderName={v.assigned_rider} maskedMobile={maskMobile(v.rider_mobile)} />
                  </td>
                  <td className="px-5 py-3 text-secondary text-xs tabular-nums">{maskAadhaar(v.rider_aadhaar) || "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${vehicleStatusColor[v.status] ?? "bg-muted/20 text-muted"}`}>{vehicleStatusLabel(v.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout history */}
      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-default">
          <h2 className="text-primary font-semibold">Payout History</h2>
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
              ) : payouts.map((p, i) => (
                <tr key={i} className="border-b border-subtle">
                  <td className="px-5 py-3 text-secondary">{p.period_month ?? p.due_date ? new Date(p.period_month ?? p.due_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3 text-accent-purple">{p.ev_number ?? "—"}</td>
                  <td className="px-5 py-3 text-secondary">{fmtDate(p.paid_date)}</td>
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

      <p className="text-faint text-xs text-center pb-2">
        <Link href="/" className="hover:text-muted">← Back to dashboard</Link>
      </p>
    </div>
  );
}
