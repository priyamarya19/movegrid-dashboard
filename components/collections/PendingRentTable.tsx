import Link from "next/link";
import { getLedgerSummary, getOverdueRiders } from "@/lib/rent";

const rupee = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default async function PendingRentTable() {
  const [summary, overdue] = await Promise.all([getLedgerSummary(), getOverdueRiders()]);
  const totals = { expected: summary.expectedToDate, collected: summary.collected, pending: summary.overdue, pct: summary.pct };
  const riders = overdue.map((r) => ({
    rider_id: r.rider_id, rider_code: r.rider_code, name: r.name, mobile: r.mobile,
    ev_number: null as string | null, vehicle_id: null as string | null, model_name: null as string | null,
    days: r.overdue_weeks, expected: 0, collected: 0, pending: r.overdue_amount,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-[#555] hover:text-[#aaa] text-sm transition-colors">← Dashboard</Link>
        <span className="text-[#333]">/</span>
        <h1 className="text-white text-2xl font-bold">Pending Rent</h1>
      </div>
      <p className="text-[#666] text-sm -mt-3">
        From the rent ledger — every overdue week per rider. Same figures the admin, ops and investor dashboards use.
      </p>

      {/* Totals strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Expected", value: rupee(totals.expected), color: "#a29bfe" },
          { label: "Collected", value: rupee(totals.collected), color: "#00D1B2" },
          { label: "Pending", value: rupee(totals.pending), color: "#ff6b6b" },
          { label: "Collection %", value: totals.pct + "%", color: totals.pct >= 80 ? "#00D1B2" : totals.pct >= 50 ? "#fdcb6e" : "#ff6b6b" },
        ].map((c) => (
          <div key={c.label} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-4">
            <p className="text-[11px] text-[#666] uppercase tracking-wider mb-1">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e]">
          <p className="text-white font-semibold">{riders.length} rider{riders.length !== 1 ? "s" : ""} with pending rent</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["User ID", "Name", "Mobile", "Overdue weeks", "Overdue amount"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riders.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-[#555]">No overdue rent — fully collected 🎉</td></tr>
              ) : riders.map((r) => (
                <tr key={r.rider_id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3"><span className="font-mono text-xs text-[#6C5CE7] font-semibold">{r.rider_code ?? "—"}</span></td>
                  <td className="px-5 py-3"><Link href={`/riders/${r.rider_id}`} className="text-white font-medium hover:text-[#6C5CE7] hover:underline transition-colors">{r.name}</Link></td>
                  <td className="px-5 py-3 text-[#aaa]">{r.mobile}</td>
                  <td className="px-5 py-3 text-[#aaa]">{r.days}</td>
                  <td className="px-5 py-3 font-semibold text-[#ff6b6b]">{rupee(r.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
