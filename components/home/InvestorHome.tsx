import Link from "next/link";
import { getPortfolioByUser } from "@/lib/portfolio";
import { vehicleStatusColor, vehicleStatusLabel } from "@/lib/vehicleStatus";

type Props = { userId: string };

export default async function InvestorHome({ userId }: Props) {
  const portfolio = await getPortfolioByUser(userId);

  if (!portfolio) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-white text-2xl font-bold">My Portfolio</h1>
          <p className="text-gray-400 text-sm mt-1">Your invested vehicles and returns</p>
        </div>
        <div className="bg-[#111118] border border-white/10 rounded-2xl p-10 text-center">
          <p className="text-gray-400">Your investor profile isn&apos;t set up yet.</p>
          <p className="text-gray-500 text-sm mt-1">Please contact the MoveGrid team to get started.</p>
        </div>
      </div>
    );
  }

  const { profile, vehicles, totalPaid, roi, impact, payoutsMade, payoutsRemaining, termMonths, nextDueDate } = portfolio;

  const sinceMonth = profile.investment_date
    ? new Date(profile.investment_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;

  const nextDueLabel = nextDueDate
    ? new Date(nextDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  const cards = [
    { label: "Total Invested", value: "₹" + Number(profile.total_invested).toLocaleString(), color: "#6C5CE7", sub: sinceMonth ? "Since " + sinceMonth : undefined },
    { label: "Earned So Far", value: "₹" + Number(totalPaid).toLocaleString(), color: "#00D1B2", sub: `${payoutsMade} of ${termMonths} payouts received` },
    { label: "Payouts Remaining", value: String(payoutsRemaining), color: "#e17055", sub: `of ${termMonths} months` },
    { label: "ROI So Far", value: roi.toFixed(1) + "%", color: "#fdcb6e", sub: undefined },
    { label: "Scooters", value: vehicles.length.toLocaleString(), color: "#00C48C", sub: "In your portfolio" },
    { label: "Next Due Date", value: nextDueLabel, color: "#74b9ff", sub: nextDueDate ? "Upcoming payout" : "All payouts done" },
  ];

  const co2Display = impact.co2SavedKg >= 1000
    ? (impact.co2SavedKg / 1000).toFixed(1) + " t"
    : Math.round(impact.co2SavedKg).toLocaleString() + " kg";

  const impactCards = [
    {
      label: "Kilometres Driven", value: Math.round(impact.km).toLocaleString() + " km", color: "#00D1B2",
      icon: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2"/>,
    },
    {
      label: "CO₂ Saved", value: co2Display, color: "#4ade80",
      icon: <path d="M3 12h4l3-9 4 18 3-9h4"/>,
    },
    {
      label: "Trees Saved", value: Math.round(impact.treesSaved).toLocaleString(), color: "#22c55e",
      icon: <path d="M12 22v-7m0 0a5 5 0 0 0 5-5c0-3-2-5-5-9-3 4-5 6-5 9a5 5 0 0 0 5 5z"/>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">My Portfolio</h1>
          <p className="text-gray-400 text-sm mt-1">Your invested vehicles and returns</p>
        </div>
        <Link
          href="/portfolio"
          className="text-sm text-[#00C48C] hover:underline shrink-0 mt-1"
        >
          View full portfolio →
        </Link>
      </div>

      {/* Environmental impact */}
      <div className="bg-gradient-to-br from-[#0c1f18] to-[#111118] border border-[#00C48C]/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00C48C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>
          <h2 className="text-white font-semibold">Environmental Impact</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {impactCards.map((c) => (
            <div key={c.label} className="bg-[#0A0A0F]/60 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2" style={{ color: c.color }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{c.icon}</svg>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{c.label}</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[#4d6b5f] text-xs mt-3">
          Estimated environmental impact — actual CO₂ saved and trees equivalent may vary.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-[#111118] border border-white/10 rounded-2xl p-5">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">{c.label}</p>
            <p className={`${c.label === "Next Due Date" ? "text-xl" : "text-2xl"} font-bold`} style={{ color: c.color }}>{c.value}</p>
            {c.sub && <p className="text-gray-500 text-xs mt-1">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Vehicles table */}
      <div className="bg-[#111118] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold">Your Vehicles ({vehicles.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {["EV No.", "Model", "Hub", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 text-white font-medium">{v.ev_number}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{v.model_name ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{v.hub_name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${vehicleStatusColor[v.status] ?? "bg-gray-500/20 text-gray-400"}`}>
                      {vehicleStatusLabel(v.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-500">No vehicles assigned yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
