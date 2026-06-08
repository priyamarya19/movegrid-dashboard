import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { getSession } from "@/lib/auth";
import { getPortfolioByUser } from "@/lib/portfolio";
import { maskMobile, maskAadhaar } from "@/lib/mask";
import RevealNumberButton from "@/components/investors/RevealNumberButton";

const payoutStatus: Record<string, string> = {
  paid: "bg-green-500/20 text-green-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  delayed: "bg-red-500/20 text-red-400",
};

const vehicleStatus: Record<string, string> = {
  assigned: "bg-green-500/20 text-green-400",
  available: "bg-blue-500/20 text-blue-400",
  maintenance: "bg-yellow-500/20 text-yellow-400",
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
        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-2xl p-10 text-center">
          <p className="text-[#aaa]">Your investor profile isn&apos;t set up yet.</p>
          <p className="text-[#555] text-sm mt-1">Please contact the MoveGrid team to get started.</p>
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
    { label: "Total Invested", value: "₹" + Number(profile.total_invested).toLocaleString(), color: "#6C5CE7", sub: sinceMonth ? "Since " + sinceMonth : undefined },
    { label: "Earned So Far", value: "₹" + Number(totalPaid).toLocaleString(), color: "#00D1B2", sub: `${payoutsMade} of ${termMonths} payouts received` },
    { label: "Payouts Remaining", value: String(payoutsRemaining), color: "#e17055", sub: `of ${termMonths} months` },
    { label: "ROI So Far", value: roi.toFixed(1) + "%", color: "#fdcb6e", sub: undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">My Portfolio</h1>
          <p className="text-[#666] text-sm mt-1">
            {name} · Investing since {fmtDate(profile.investment_date)}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${profile.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>
          {profile.status}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <p className="text-[11px] text-[#555] uppercase tracking-wider mb-2">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            {c.sub && <p className="text-[#555] text-xs mt-1">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Vehicles */}
      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e]">
          <h2 className="text-white font-semibold">My Vehicles ({vehicles.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["EV No.", "Model", "Hub", "Rider", "Mobile No.", "Aadhaar", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-[#555]">No vehicles assigned yet</td></tr>
              ) : vehicles.map((v) => (
                <tr key={v.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-[#6C5CE7] font-medium">{v.ev_number}</td>
                  <td className="px-5 py-3 text-[#aaa] text-xs">{v.model_name ?? "—"}</td>
                  <td className="px-5 py-3 text-[#aaa] text-xs">{v.hub_name ?? "—"}</td>
                  <td className="px-5 py-3 text-[#fdcb6e] text-xs">{v.assigned_rider ?? "—"}</td>
                  <td className="px-5 py-3 text-xs">
                    <RevealNumberButton vehicleId={v.id} riderName={v.assigned_rider} maskedMobile={maskMobile(v.rider_mobile)} />
                  </td>
                  <td className="px-5 py-3 text-[#aaa] text-xs tabular-nums">{maskAadhaar(v.rider_aadhaar) || "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${vehicleStatus[v.status] ?? "bg-gray-500/20 text-gray-400"}`}>{v.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout history */}
      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e]">
          <h2 className="text-white font-semibold">Payout History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["Month", "Vehicle", "Paid Date", "Amount", "Status", "Receipt"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-[#555]">No payouts yet</td></tr>
              ) : payouts.map((p, i) => (
                <tr key={i} className="border-b border-[#1a1a2a]">
                  <td className="px-5 py-3 text-[#ccc]">{p.period_month ?? p.due_date ? new Date(p.period_month ?? p.due_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3 text-[#6C5CE7]">{p.ev_number ?? "—"}</td>
                  <td className="px-5 py-3 text-[#aaa]">{fmtDate(p.paid_date)}</td>
                  <td className="px-5 py-3 text-[#00D1B2] font-semibold">₹{Number(p.amount).toLocaleString()}</td>
                  <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs capitalize ${payoutStatus[p.status] ?? "bg-gray-500/20 text-gray-400"}`}>{p.status}</span></td>
                  <td className="px-5 py-3">
                    {p.proof_url ? (
                      <a href={`/api/file?key=${encodeURIComponent(p.proof_url)}`} target="_blank" rel="noopener noreferrer" className="text-[#6C5CE7] hover:underline text-xs">View</a>
                    ) : <span className="text-[#555] text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[#444] text-xs text-center pb-2">
        <Link href="/" className="hover:text-[#666]">← Back to dashboard</Link>
      </p>
    </div>
  );
}
