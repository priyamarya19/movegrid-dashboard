import { notFound } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import BackButton from "@/components/BackButton";
import { vehicleStatusColor, vehicleStatusLabel } from "@/lib/vehicleStatus";

async function getData(id: string) {
  const [hub, riders, vehicles] = await Promise.all([
    pool.query(`SELECT * FROM ${schemas.ops}.hubs WHERE id = $1`, [id]),

    pool.query(`
      SELECT r.id, r.name, r.mobile, r.status,
             v.ev_number AS vehicle_number, v.id AS vehicle_id
      FROM ${schemas.ops}.riders r
      LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.rider_id = r.id AND rva.status = 'active'
      LEFT JOIN ${schemas.ops}.vehicles v ON v.id = rva.vehicle_id
      WHERE r.assigned_hub_id = $1
      ORDER BY r.status, r.name
    `, [id]),

    pool.query(`
      SELECT v.id, v.ev_number, v.status,
             m.model_name, m.oem,
             r.name AS assigned_rider, r.id AS rider_id,
             u.name AS investor_name, ip.id AS investor_id
      FROM ${schemas.ops}.vehicles v
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      LEFT JOIN ${schemas.ops}.rider_vehicle_assignments rva ON rva.vehicle_id = v.id AND rva.status = 'active'
      LEFT JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
      LEFT JOIN ${schemas.ops}.investor_profiles ip ON ip.id = v.investor_id
      LEFT JOIN ${schemas.auth}.users u ON u.id = ip.user_id
      WHERE v.hub_id = $1
      ORDER BY v.status, v.ev_number
    `, [id]),
  ]);

  if (!hub.rows[0]) return null;
  return { hub: hub.rows[0], riders: riders.rows, vehicles: vehicles.rows };
}

const riderStatus: Record<string, string> = {
  active: "bg-accent-success/20 text-accent-success-text",
  inactive: "bg-muted/20 text-muted",
  pending: "bg-accent-warning/20 text-accent-warning-text",
};


export default async function HubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getData(id);
  if (!data) notFound();

  const { hub, riders, vehicles } = data;
  const activeRiders = riders.filter((r: { status: string }) => r.status === "active").length;
  const assignedVehicles = vehicles.filter((v: { status: string }) => v.status === "assigned").length;
  const availableVehicles = vehicles.filter((v: { status: string }) => v.status === "ready_to_deploy").length;

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <BackButton fallback="/hubs" label="Hubs" />
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">{hub.hub_name}</span>
        </div>

        <div>
          <h1 className="text-primary text-2xl font-bold">{hub.hub_name}</h1>
          <p className="text-muted text-sm mt-1">{hub.area}, {hub.city} · Capacity: {hub.vehicle_capacity} vehicles</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-default rounded-xl p-5 space-y-2">
            <h2 className="text-primary font-semibold mb-3">Hub Info</h2>
            {[
              { label: "Hub Name", value: hub.hub_name },
              { label: "Area", value: hub.area ?? "—" },
              { label: "City", value: hub.city ?? "—" },
              { label: "Capacity", value: hub.vehicle_capacity ? `${hub.vehicle_capacity} vehicles` : "—" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2 border-b border-default last:border-0">
                <span className="text-muted text-sm">{row.label}</span>
                <span className="text-secondary text-sm">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="bg-surface border border-default rounded-xl p-5 space-y-2">
            <h2 className="text-primary font-semibold mb-3">Owner / Lease</h2>
            {[
              { label: "Owner Name", value: hub.owner_name ?? "—" },
              { label: "Owner Mobile", value: hub.owner_mobile ?? "—" },
              { label: "Security Deposit", value: hub.security_deposit ? "₹" + Number(hub.security_deposit).toLocaleString() : "—" },
              { label: "Monthly Rent", value: hub.monthly_rent ? "₹" + Number(hub.monthly_rent).toLocaleString() : "—" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2 border-b border-default last:border-0">
                <span className="text-muted text-sm">{row.label}</span>
                <span className="text-secondary text-sm">{row.value}</span>
              </div>
            ))}
            {hub.agreement_pdf_url && (
              <div className="pt-2">
                <a href={hub.agreement_pdf_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-purple hover:underline">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  View Agreement PDF
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Riders", value: riders.length.toString(), color: "var(--accent-purple)" },
            { label: "Active Riders", value: activeRiders.toString(), color: "var(--accent-teal)" },
            { label: "Vehicles Assigned", value: assignedVehicles.toString(), color: "var(--accent-warning)" },
            { label: "Vehicles Available", value: availableVehicles.toString(), color: "var(--accent-purple-2)" },
          ].map((c) => (
            <div key={c.label} className="bg-surface border border-default rounded-xl p-5">
              <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
              <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-surface border border-default rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-default">
            <h2 className="text-primary font-semibold">Riders ({riders.length})</h2>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Name", "Mobile", "Vehicle", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riders.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-muted">No riders</td></tr>
              ) : riders.map((r: { id: string; name: string; mobile: string; vehicle_number: string; vehicle_id: string; status: string }) => (
                <tr key={r.id} className="border-b border-subtle hover:bg-overlay-hover">
                  <td className="px-5 py-3">
                    <Link href={`/riders/${r.id}`} className="text-accent-purple hover:underline font-medium">{r.name}</Link>
                  </td>
                  <td className="px-5 py-3 text-secondary">{r.mobile}</td>
                  <td className="px-5 py-3">
                    {r.vehicle_id ? (
                      <Link href={`/vehicles/${r.vehicle_id}`} className="text-accent-teal hover:underline">{r.vehicle_number}</Link>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${riderStatus[r.status] ?? "bg-muted/20 text-muted"}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="bg-surface border border-default rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-default">
            <h2 className="text-primary font-semibold">Vehicles ({vehicles.length})</h2>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["EV Number", "Model", "Assigned To", "Investor", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">No vehicles</td></tr>
              ) : vehicles.map((v: { id: string; ev_number: string; model_name: string; oem: string; rider_id: string; assigned_rider: string; investor_id: string; investor_name: string; status: string }) => (
                <tr key={v.id} className="border-b border-subtle hover:bg-overlay-hover">
                  <td className="px-5 py-3">
                    <Link href={`/vehicles/${v.id}`} className="text-accent-purple hover:underline font-medium">{v.ev_number}</Link>
                  </td>
                  <td className="px-5 py-3 text-secondary">{v.model_name} <span className="text-muted text-xs">{v.oem}</span></td>
                  <td className="px-5 py-3">
                    {v.rider_id ? (
                      <Link href={`/riders/${v.rider_id}`} className="text-accent-warning hover:underline">{v.assigned_rider}</Link>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {v.investor_id ? (
                      <Link href={`/investors/${v.investor_id}`} className="text-accent-teal hover:underline">{v.investor_name}</Link>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${vehicleStatusColor[v.status] ?? "bg-muted/20 text-muted"}`}>{vehicleStatusLabel(v.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

      </div>
    </DashboardLayout>
  );
}
