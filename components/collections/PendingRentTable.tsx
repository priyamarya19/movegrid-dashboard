import Link from "next/link";
import { getLedgerSummary, getOverdueRiders } from "@/lib/rent";
import ExportButton from "@/components/ExportButton";

const rupee = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default async function PendingRentTable() {
  const [summary, overdue] = await Promise.all([getLedgerSummary(), getOverdueRiders()]);
  const totals = { expected: summary.expectedToDate, collected: summary.collected, pending: summary.overdue, pct: summary.pct };
  const riders = overdue.map((r) => ({
    rider_id: r.rider_id, rider_code: r.rider_code, name: r.name, mobile: r.mobile,
    ev_number: null as string | null, vehicle_id: null as string | null, model_name: null as string | null,
    weeks: r.overdue_weeks, expected: 0, collected: 0, pending: r.overdue_amount,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-muted hover:text-secondary text-sm transition-colors">← Dashboard</Link>
        <span className="text-faint">/</span>
        <h1 className="text-primary text-2xl font-bold">Pending Rent</h1>
      </div>
      <p className="text-muted text-sm -mt-3">
        From the rent ledger — every overdue week per rider. Same figures the admin, ops and investor dashboards use.
      </p>

      {/* Totals strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Expected", value: rupee(totals.expected), color: "var(--accent-purple-2)" },
          { label: "Collected", value: rupee(totals.collected), color: "var(--accent-teal)" },
          { label: "Pending", value: rupee(totals.pending), color: "var(--accent-danger-alt)" },
          { label: "Collection %", value: totals.pct + "%", color: totals.pct >= 80 ? "var(--accent-teal)" : totals.pct >= 50 ? "var(--accent-warning)" : "var(--accent-danger-alt)" },
        ].map((c) => (
          <div key={c.label} className="bg-surface border border-default rounded-xl p-4">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-1">{c.label}</p>
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-default flex items-center justify-between gap-3">
          <p className="text-primary font-semibold">{riders.length} rider{riders.length !== 1 ? "s" : ""} with pending rent</p>
          <ExportButton filename="overdue-rent" rows={riders} columns={[
            { label: "User ID", key: "rider_code" }, { label: "Name", key: "name" }, { label: "Mobile", key: "mobile" },
            { label: "Weeks overdue", key: "weeks" }, { label: "Overdue amount", key: "pending" },
          ]} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["User ID", "Name", "Mobile", "Weeks overdue", "Overdue amount"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riders.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">No overdue rent — fully collected 🎉</td></tr>
              ) : riders.map((r) => (
                <tr key={r.rider_id} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                  <td className="px-5 py-3"><Link href={`/riders/${r.rider_id}`} className="font-mono text-xs text-accent-purple font-semibold hover:underline">{r.rider_code ?? "—"}</Link></td>
                  <td className="px-5 py-3"><Link href={`/riders/${r.rider_id}`} className="text-primary font-medium hover:text-accent-purple hover:underline transition-colors">{r.name}</Link></td>
                  <td className="px-5 py-3 text-secondary">{r.mobile}</td>
                  <td className="px-5 py-3 text-secondary">{r.weeks}</td>
                  <td className="px-5 py-3 font-semibold text-accent-danger-alt">{rupee(r.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
