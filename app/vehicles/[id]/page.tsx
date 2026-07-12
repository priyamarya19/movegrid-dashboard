import { notFound } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import BackButton from "@/components/BackButton";
import { getSession } from "@/lib/auth";
import VehicleInvestorCard from "@/components/vehicles/VehicleInvestorCard";
import VehicleStatusControl from "@/components/vehicles/VehicleStatusControl";
import VehicleRepairsCard from "@/components/vehicles/VehicleRepairsCard";
import { inr } from "@/lib/format";

async function getData(id: string) {
  const [vehicle, assignments, payouts, repairs] = await Promise.all([
    pool.query(`
      SELECT v.*, m.model_name, m.oem, m.rental_per_day,
             h.hub_name, h.id AS hub_id, h.city AS hub_city,
             u.name AS investor_name, ip.id AS investor_id, ip.total_invested
      FROM ${schemas.ops}.vehicles v
      LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      LEFT JOIN ${schemas.ops}.hubs h ON h.id = v.hub_id
      LEFT JOIN ${schemas.ops}.investor_profiles ip ON ip.id = v.investor_id
      LEFT JOIN ${schemas.auth}.users u ON u.id = ip.user_id
      WHERE v.id = $1
    `, [id]),

    pool.query(`
      SELECT rva.assigned_date, rva.returned_date, rva.status, rva.allotment_code,
             r.name AS rider_name, r.id AS rider_id, r.mobile AS rider_mobile, r.rider_code
      FROM ${schemas.ops}.rider_vehicle_assignments rva
      JOIN ${schemas.ops}.riders r ON r.id = rva.rider_id
      WHERE rva.vehicle_id = $1
      ORDER BY rva.assigned_date DESC
    `, [id]),

    pool.query(`
      SELECT amount, due_date, paid_date, status
      FROM ${schemas.ops}.investor_payouts
      WHERE vehicle_id = $1
      ORDER BY due_date DESC
    `, [id]),

    pool.query(`
      SELECT vr.id, vr.part_name, vr.amount, to_char(vr.repair_date,'YYYY-MM-DD') AS repair_date,
             vr.payment_mode, vr.payment_reference, vr.notes, vr.rider_name_raw,
             vr.rider_id, r.name AS rider_name
      FROM ${schemas.ops}.vehicle_repairs vr
      LEFT JOIN ${schemas.ops}.riders r ON r.id = vr.rider_id
      WHERE vr.vehicle_id = $1
      ORDER BY vr.repair_date DESC NULLS LAST, vr.created_at DESC
    `, [id]),
  ]);

  if (!vehicle.rows[0]) return null;
  return { vehicle: vehicle.rows[0], assignments: assignments.rows, payouts: payouts.rows, repairs: repairs.rows };
}

const statusColor: Record<string, string> = {
  assigned: "bg-accent-success/20 text-accent-success-text",
  available: "bg-accent-purple-2/15 text-accent-purple-2-text",
  maintenance: "bg-accent-warning/20 text-accent-warning-text",
  retired: "bg-muted/20 text-muted",
  blocked: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

const payoutStatus: Record<string, string> = {
  paid: "bg-accent-success/20 text-accent-success-text",
  pending: "bg-accent-warning/20 text-accent-warning-text",
  delayed: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
};

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, session] = await Promise.all([getData(id), getSession()]);
  if (!data) notFound();

  const { vehicle, assignments, payouts, repairs } = data;
  const isAdmin = session?.role === "admin";
  const canEditStatus = !!session && ["admin", "ops_manager"].includes(session.role);
  const activeAssignment = assignments.find((a: { status: string }) => a.status === "active");
  const totalPayouts = payouts.reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <BackButton fallback="/vehicles" label="Vehicles" />
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">{vehicle.ev_number}</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-primary text-2xl font-bold">{vehicle.ev_number}</h1>
            <p className="text-muted text-sm mt-1">{vehicle.model_name} · {vehicle.oem}</p>
          </div>
          <VehicleStatusControl vehicleId={vehicle.id} status={vehicle.status} canEdit={canEditStatus} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Purchase Price", value: vehicle.price ? inr(vehicle.price) : "—", color: "var(--accent-purple)" },
            { label: "Daily Rental", value: vehicle.rental_per_day ? "₹" + vehicle.rental_per_day : "—", color: "var(--accent-teal)" },
            { label: "Total Payouts", value: inr(totalPayouts), color: "var(--accent-warning)" },
            { label: "Allotments", value: assignments.length.toString(), color: "var(--accent-purple-2)" },
          ].map((c) => (
            <div key={c.label} className="bg-surface border border-default rounded-xl p-5">
              <p className="text-[11px] text-muted uppercase tracking-wider mb-2">{c.label}</p>
              <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-default rounded-xl p-5">
            <h2 className="text-primary font-semibold mb-4">Vehicle Details</h2>
            {[
              { label: "EV Number", value: vehicle.ev_number },
              { label: "Chassis No.", value: vehicle.chassis_number ?? "—" },
              { label: "Motor No.", value: vehicle.motor_number ?? "—" },
              { label: "Controller No.", value: vehicle.controller_number ?? "—" },
              { label: "Model", value: `${vehicle.model_name} (${vehicle.oem})` },
              { label: "Purchase Date", value: vehicle.purchase_date ? new Date(vehicle.purchase_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2 border-b border-default last:border-0">
                <span className="text-muted text-sm">{row.label}</span>
                <span className="text-secondary text-sm">{row.value}</span>
              </div>
            ))}
            {(vehicle.battery_number || vehicle.battery_partner || vehicle.iot_imei || vehicle.iot_partner) && (
              <div className="pt-3">
                <p className="text-muted text-xs uppercase tracking-wider mb-2">Hardware</p>
                {[
                  { label: "Battery No.", value: vehicle.battery_number ?? "—" },
                  { label: "Battery Partner", value: vehicle.battery_partner ?? "—" },
                  { label: "IOT IMEI", value: vehicle.iot_imei ?? "—" },
                  { label: "IOT Partner", value: vehicle.iot_partner ?? "—" },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between py-2 border-b border-default last:border-0">
                    <span className="text-muted text-sm">{row.label}</span>
                    <span className="text-secondary text-sm">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-surface border border-default rounded-xl p-5">
              <h2 className="text-primary font-semibold mb-3">Hub</h2>
              {vehicle.hub_id ? (
                <Link href={`/hubs/${vehicle.hub_id}`} className="flex items-center justify-between group">
                  <div>
                    <p className="text-accent-purple font-medium group-hover:underline">{vehicle.hub_name}</p>
                    <p className="text-muted text-xs">{vehicle.hub_city}</p>
                  </div>
                  <span className="text-muted group-hover:text-primary">→</span>
                </Link>
              ) : <p className="text-muted text-sm">No hub assigned</p>}
            </div>

            <VehicleInvestorCard
              vehicleId={vehicle.id}
              investorId={vehicle.investor_id ?? null}
              investorName={vehicle.investor_name ?? null}
              totalInvested={vehicle.total_invested ?? null}
              canEdit={isAdmin}
            />

            <div className="bg-surface border border-default rounded-xl p-5">
              <h2 className="text-primary font-semibold mb-3">Current Rider</h2>
              {activeAssignment ? (
                <Link href={`/riders/${activeAssignment.rider_id}`} className="flex items-center justify-between group">
                  <div>
                    <p className="text-accent-warning font-medium group-hover:underline">{activeAssignment.rider_name}</p>
                    <p className="text-muted text-xs">{activeAssignment.rider_mobile}</p>
                  </div>
                  <span className="text-muted group-hover:text-primary">→</span>
                </Link>
              ) : <p className="text-muted text-sm">Not assigned</p>}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-default rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-default">
            <h2 className="text-primary font-semibold">Rider History</h2>
            <p className="text-muted text-xs mt-0.5">Who held this vehicle, and when</p>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Rider", "Allotment ID", "From", "To", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted">No assignments yet</td></tr>
              ) : assignments.map((a: { rider_id: string; rider_name: string; rider_mobile: string; rider_code: string; allotment_code: string; assigned_date: string; returned_date: string; status: string }, i: number) => (
                <tr key={i} className="border-b border-subtle">
                  <td className="px-5 py-3">
                    <Link href={`/riders/${a.rider_id}`} className="text-accent-purple hover:underline">{a.rider_name}</Link>
                    <p className="text-muted text-xs">{a.rider_code} · {a.rider_mobile}</p>
                  </td>
                  <td className="px-5 py-3 text-secondary text-xs">{a.allotment_code ?? "—"}</td>
                  <td className="px-5 py-3 text-secondary text-xs">{new Date(a.assigned_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-5 py-3 text-secondary text-xs">{a.returned_date ? new Date(a.returned_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Active"}</td>
                  <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs capitalize ${statusColor[a.status] ?? "bg-muted/20 text-muted"}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <VehicleRepairsCard vehicleId={vehicle.id} repairs={repairs} canEdit={canEditStatus} />

        <div className="bg-surface border border-default rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-default">
            <h2 className="text-primary font-semibold">Investor Payout History</h2>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {["Due Date", "Paid Date", "Amount", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-muted">No payouts yet</td></tr>
              ) : payouts.map((p: { due_date: string; paid_date: string; amount: number; status: string }, i: number) => (
                <tr key={i} className="border-b border-subtle">
                  <td className="px-5 py-3 text-secondary">{new Date(p.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-5 py-3 text-secondary">{p.paid_date ? new Date(p.paid_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3 text-accent-teal font-semibold">{inr(p.amount)}</td>
                  <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs capitalize ${payoutStatus[p.status] ?? "bg-muted/20 text-muted"}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

      </div>
    </DashboardLayout>
  );
}
