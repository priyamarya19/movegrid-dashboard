import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { unstable_cache } from "next/cache";
import Link from "next/link";

const getStats = unstable_cache(async function getStats() {
  const [riders, vehicles, recentRiders, rentAlerts] = await Promise.all([
    pool.query(`SELECT status, COUNT(*) FROM ${schemas.ops}.riders GROUP BY status`),
    pool.query(`SELECT status, COUNT(*) FROM ${schemas.ops}.vehicles GROUP BY status`),
    pool.query(`
      SELECT r.id, r.name, r.mobile, r.status, r.created_at,
             v.ev_number, h.hub_name
      FROM ${schemas.ops}.riders r
      LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.rider_id = r.id AND rva.status = 'active'
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = r.assigned_hub_id
      ORDER BY r.created_at DESC LIMIT 10
    `),
    pool.query(`
      WITH rent_due AS (
        SELECT r.id, r.name, r.mobile, r.rental_mode, r.created_at,
          CASE r.rental_mode WHEN 'weekly' THEN 7 WHEN 'fortnightly' THEN 14 ELSE 30 END AS period_days,
          (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS today_ist,
          (r.created_at AT TIME ZONE 'Asia/Kolkata')::date AS joined_ist,
          CASE r.rental_mode
            WHEN 'weekly'      THEN ((r.created_at AT TIME ZONE 'Asia/Kolkata')::date + (GREATEST(CEIL(((NOW() AT TIME ZONE 'Asia/Kolkata')::date - (r.created_at AT TIME ZONE 'Asia/Kolkata')::date)::float / 7),  1) *  7)::int)
            WHEN 'fortnightly' THEN ((r.created_at AT TIME ZONE 'Asia/Kolkata')::date + (GREATEST(CEIL(((NOW() AT TIME ZONE 'Asia/Kolkata')::date - (r.created_at AT TIME ZONE 'Asia/Kolkata')::date)::float / 14), 1) * 14)::int)
            ELSE CASE
              WHEN (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata')::date) + (EXTRACT(day FROM (r.created_at AT TIME ZONE 'Asia/Kolkata')) - 1) * INTERVAL '1 day')::date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
              THEN (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata')::date) + (EXTRACT(day FROM (r.created_at AT TIME ZONE 'Asia/Kolkata')) - 1) * INTERVAL '1 day')::date
              ELSE (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata')::date) + INTERVAL '1 month' + (EXTRACT(day FROM (r.created_at AT TIME ZONE 'Asia/Kolkata')) - 1) * INTERVAL '1 day')::date
            END
          END AS next_due_date,
          CASE r.rental_mode
            WHEN 'weekly'      THEN ((r.created_at AT TIME ZONE 'Asia/Kolkata')::date + (FLOOR(((NOW() AT TIME ZONE 'Asia/Kolkata')::date - (r.created_at AT TIME ZONE 'Asia/Kolkata')::date)::float / 7)  *  7)::int)
            WHEN 'fortnightly' THEN ((r.created_at AT TIME ZONE 'Asia/Kolkata')::date + (FLOOR(((NOW() AT TIME ZONE 'Asia/Kolkata')::date - (r.created_at AT TIME ZONE 'Asia/Kolkata')::date)::float / 14) * 14)::int)
            ELSE CASE
              WHEN (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata')::date) + (EXTRACT(day FROM (r.created_at AT TIME ZONE 'Asia/Kolkata')) - 1) * INTERVAL '1 day')::date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date
              THEN (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata')::date) + (EXTRACT(day FROM (r.created_at AT TIME ZONE 'Asia/Kolkata')) - 1) * INTERVAL '1 day')::date
              ELSE (DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kolkata')::date) - INTERVAL '1 month' + (EXTRACT(day FROM (r.created_at AT TIME ZONE 'Asia/Kolkata')) - 1) * INTERVAL '1 day')::date
            END
          END AS last_due_date
        FROM ${schemas.ops}.riders r
        WHERE r.status = 'active'
      )
      SELECT id, name, mobile, rental_mode, next_due_date, last_due_date,
        CASE
          WHEN last_due_date < today_ist AND last_due_date > joined_ist
            AND NOT EXISTS (SELECT 1 FROM uat_ops.rider_payments p WHERE p.rider_id = rent_due.id AND p.rental_period_start >= rent_due.last_due_date - rent_due.period_days * INTERVAL '1 day' AND p.amount_collected >= 1610)
          THEN 'overdue'
          WHEN next_due_date BETWEEN today_ist AND today_ist + 2 THEN 'due_soon'
          ELSE 'ok'
        END AS rent_status
      FROM rent_due
      WHERE (
        (last_due_date < today_ist AND last_due_date > joined_ist
         AND NOT EXISTS (SELECT 1 FROM ${schemas.ops}.rider_payments p WHERE p.rider_id = rent_due.id AND p.rental_period_start >= rent_due.last_due_date - rent_due.period_days * INTERVAL '1 day' AND p.amount_collected >= 1610))
        OR
        (next_due_date BETWEEN today_ist AND today_ist + 2
         AND NOT EXISTS (SELECT 1 FROM ${schemas.ops}.rider_payments p WHERE p.rider_id = rent_due.id AND p.rental_period_start >= rent_due.next_due_date - rent_due.period_days * INTERVAL '1 day' AND p.amount_collected >= 1610))
      )
      ORDER BY next_due_date ASC
      LIMIT 50
    `),
  ]);

  const rMap: Record<string, number> = {};
  riders.rows.forEach((r: { status: string; count: string }) => { rMap[r.status] = Number(r.count); });
  const vMap: Record<string, number> = {};
  vehicles.rows.forEach((r: { status: string; count: string }) => { vMap[r.status] = Number(r.count); });

  const overdueCount = rentAlerts.rows.filter((r: { rent_status: string }) => r.rent_status === "overdue").length;
  const dueSoonCount = rentAlerts.rows.filter((r: { rent_status: string }) => r.rent_status === "due_soon").length;

  return { rMap, vMap, recentRiders: recentRiders.rows, overdueCount, dueSoonCount };
}, ["ops-stats-v3"], { revalidate: 60 });

const statusColor: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  inactive: "bg-gray-500/20 text-gray-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  suspended: "bg-red-500/20 text-red-400",
};

export default async function OpsManagerHome() {
  const { rMap, vMap, recentRiders, overdueCount, dueSoonCount } = await getStats();
  const totalVehicles = Object.values(vMap).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">Operations Dashboard</h1>
        <p className="text-[#666] text-sm mt-1">Fleet and rider overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Active Riders", value: rMap["active"] ?? 0, color: "#00D1B2", href: "/riders?status=active" },
          { label: "Pending KYC", value: rMap["pending"] ?? 0, color: "#fdcb6e", href: "/riders?status=pending" },
          { label: "Vehicles Deployed", value: vMap["assigned"] ?? 0, color: "#6C5CE7", href: "/vehicles?status=assigned" },
          { label: "Available Vehicles", value: vMap["available"] ?? 0, color: "#a29bfe", href: "/vehicles?status=available" },
          { label: "Overdue Rent", value: overdueCount, color: "#ff6b6b", href: "/riders/overdue" },
          { label: "Due in 2 Days", value: dueSoonCount, color: "#fdcb6e", href: "/riders/due-soon" },
        ].map((c) => (
          <Link key={c.label} href={c.href} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#333] transition-colors">
            <p className="text-[11px] text-[#555] uppercase tracking-wider mb-2">{c.label}</p>
            <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
          </Link>
        ))}
      </div>

      {/* Vehicle utilisation bar */}
      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
        <p className="text-white font-semibold mb-4">Fleet Utilisation</p>
        <div className="space-y-3">
          {[
            { label: "Assigned", color: "#00D1B2", val: vMap["assigned"] ?? 0 },
            { label: "Available", color: "#a29bfe", val: vMap["available"] ?? 0 },
            { label: "Maintenance", color: "#fdcb6e", val: vMap["maintenance"] ?? 0 },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-sm shrink-0" style={{ color: row.color }}>{row.label}</span>
              <div className="flex-1 h-2 bg-[#1e1e2e] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: totalVehicles ? `${Math.round(row.val / totalVehicles * 100)}%` : "0%", background: row.color }} />
              </div>
              <span className="w-8 text-right text-white font-semibold text-xs shrink-0">{row.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Riders */}
      <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
          <h2 className="text-white font-semibold">Recent Riders</h2>
          <Link href="/riders" className="text-xs text-[#6C5CE7] hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["Name", "Mobile", "Hub", "Vehicle", "Status", "Joined"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRiders.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-[#555]">No riders yet</td></tr>
              ) : recentRiders.map((r: { id: string; name: string; mobile: string; status: string; created_at: string; ev_number: string; hub_name: string }) => (
                <tr key={r.id} className="border-b border-[#1a1a2a] hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/riders/${r.id}`} className="text-white font-medium hover:text-[#6C5CE7] hover:underline">{r.name}</Link>
                  </td>
                  <td className="px-5 py-3 text-[#aaa]">{r.mobile}</td>
                  <td className="px-5 py-3 text-[#aaa]">{r.hub_name ?? "—"}</td>
                  <td className="px-5 py-3 text-[#6C5CE7]">{r.ev_number ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${statusColor[r.status] ?? "bg-gray-500/20 text-gray-400"}`}>{r.status}</span>
                  </td>
                  <td className="px-5 py-3 text-[#555] text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
