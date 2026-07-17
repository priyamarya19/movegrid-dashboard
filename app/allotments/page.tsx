import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { IST } from "@/lib/rent";
import { dateIN } from "@/lib/format";

export const dynamic = "force-dynamic";

type Row = {
  rider_id: string; rider_code: string;
  vehicle_id: string; ev_number: string;
  assigned_date: string; week_start: string; week_end: string;
  allotted_by: string | null; days_behind: number;
};

// Active allotments only. Rent status is a mutually-exclusive 3-way from
// days_behind = today - paid_through: <=0 Paid, 1-7 Pending this week, >7 Overdue.
// Rent week is the currently-owing week = [paid_through+1, paid_through+7].
async function getAllotments(): Promise<Row[]> {
  const S = schemas.ops;
  const res = await pool.query(`
    SELECT r.id AS rider_id, r.rider_code, v.id AS vehicle_id, v.ev_number,
      to_char(a.assigned_date, 'YYYY-MM-DD') AS assigned_date,
      to_char(COALESCE(a.paid_through_date, a.assigned_date - 1) + 1, 'YYYY-MM-DD') AS week_start,
      to_char(COALESCE(a.paid_through_date, a.assigned_date - 1) + 7, 'YYYY-MM-DD') AS week_end,
      a.allotted_by,
      (${IST} - COALESCE(a.paid_through_date, a.assigned_date - 1))::int AS days_behind
    FROM ${S}.rider_vehicle_assignments a
    JOIN ${S}.riders r ON r.id = a.rider_id
    JOIN ${S}.vehicles v ON v.id = a.vehicle_id
    WHERE a.status = 'active'
    ORDER BY a.assigned_date DESC`);
  return res.rows;
}

function rentStatus(daysBehind: number): { label: string; cls: string } {
  if (daysBehind <= 0) return { label: "Paid", cls: "bg-accent-success/20 text-accent-success-text" };
  if (daysBehind <= 7) return { label: "Pending this week", cls: "bg-accent-warning/20 text-accent-warning-text" };
  return { label: "Overdue", cls: "bg-accent-danger-alt/20 text-accent-danger-alt-text" };
}

const dm = { day: "numeric", month: "short" } as const;

export default async function AllotmentsPage() {
  return (
    <DashboardLayout requireAllotments>
      <AllotmentsList />
    </DashboardLayout>
  );
}

async function AllotmentsList() {
  const rows = await getAllotments();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-primary text-2xl font-bold">Allotments</h1>
        <p className="text-muted text-sm mt-1">{rows.length} active allotment{rows.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="bg-surface border border-default rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Rider", "Vehicle", "Allotted On", "Rent Week", "Allotted By", "Rent Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No active allotments</td></tr>
              ) : rows.map((r, i) => {
                const st = rentStatus(r.days_behind);
                return (
                  <tr key={i} className="border-b border-subtle hover:bg-overlay-hover transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/riders/${r.rider_id}`} className="font-mono text-xs text-accent-purple font-semibold hover:underline">{r.rider_code ?? "—"}</Link>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/vehicles/${r.vehicle_id}`} className="text-accent-purple font-medium hover:underline">{r.ev_number}</Link>
                    </td>
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">{dateIN(r.assigned_date, { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">{dateIN(r.week_start, dm)} – {dateIN(r.week_end, dm)}</td>
                    <td className="px-5 py-3 text-secondary whitespace-nowrap">{r.allotted_by ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
