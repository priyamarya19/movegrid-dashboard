import { notFound } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import BackButton from "@/components/BackButton";
import { getSession } from "@/lib/auth";
import VehicleInvestorCard from "@/components/vehicles/VehicleInvestorCard";
import VehicleStatusControl from "@/components/vehicles/VehicleStatusControl";

async function getData(id: string) {
  const [vehicle, assignments, payouts] = await Promise.all([
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
      SELECT rva.assigned_date, rva.returned_date, rva.status,
             r.name AS rider_name, r.id AS rider_id, r.mobile AS rider_mobile
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
  ]);

  if (!vehicle.rows[0]) return null;
  return { vehicle: vehicle.rows[0], assignments: assignments.rows, payouts: payouts.rows };
}

const statusColor: Record<string, string> = {
  assigned: "bg-green-500/20 text-green-400",
  available: "bg-blue-500/20 text-blue-400",
  maintenance: "bg-yellow-500/20 text-yellow-400",
  retired: "bg-gray-500/20 text-gray-400",
  blocked: "bg-red-500/20 text-red-400",
};

const payoutStatus: Record<string, string> = {
  paid: "bg-green-500/20 text-green-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  delayed: "bg-red-500/20 text-red-400",
};

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, session] = await Promise.all([getData(id), getSession()]);
  if (!data) notFound();

  const { vehicle, assignments, payouts } = data;
  const isAdmin = session?.role === "admin";
  const canEditStatus = !!session && ["admin", "ops_manager"].includes(session.role);
  const activeAssignment = assignments.find((a: { status: string }) => a.status === "active");
  const totalPayouts = payouts.reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <BackButton fallback="/vehicles" label="Vehicles" />
          <span className="text-[#333]">/</span>
          <span className="text-white text-sm">{vehicle.ev_number}</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">{vehicle.ev_number}</h1>
            <p className="text-[#666] text-sm mt-1">{vehicle.model_name} · {vehicle.oem}</p>
          </div>
          <VehicleStatusControl vehicleId={vehicle.id} status={vehicle.status} canEdit={canEditStatus} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Purchase Price", value: vehicle.price ? "₹" + Number(vehicle.price).toLocaleString() : "—", color: "#6C5CE7" },
            { label: "Daily Rental", value: vehicle.rental_per_day ? "₹" + vehicle.rental_per_day : "—", color: "#00D1B2" },
            { label: "Total Payouts", value: "₹" + Number(totalPayouts).toLocaleString(), color: "#fdcb6e" },
            { label: "Assignments", value: assignments.length.toString(), color: "#a29bfe" },
          ].map((c) => (
            <div key={c.label} className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
              <p className="text-[11px] text-[#555] uppercase tracking-wider mb-2">{c.label}</p>
              <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4">Vehicle Details</h2>
            {[
              { label: "EV Number", value: vehicle.ev_number },
              { label: "Chassis No.", value: vehicle.chassis_number ?? "—" },
              { label: "Motor No.", value: vehicle.motor_number ?? "—" },
              { label: "Controller No.", value: vehicle.controller_number ?? "—" },
              { label: "Model", value: `${vehicle.model_name} (${vehicle.oem})` },
              { label: "Purchase Date", value: vehicle.purchase_date ? new Date(vehicle.purchase_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2 border-b border-[#1e1e2e] last:border-0">
                <span className="text-[#555] text-sm">{row.label}</span>
                <span className="text-[#ccc] text-sm">{row.value}</span>
              </div>
            ))}
            {(vehicle.battery_number || vehicle.battery_partner || vehicle.iot_imei || vehicle.iot_partner) && (
              <div className="pt-3">
                <p className="text-[#555] text-xs uppercase tracking-wider mb-2">Hardware</p>
                {[
                  { label: "Battery No.", value: vehicle.battery_number ?? "—" },
                  { label: "Battery Partner", value: vehicle.battery_partner ?? "—" },
                  { label: "IOT IMEI", value: vehicle.iot_imei ?? "—" },
                  { label: "IOT Partner", value: vehicle.iot_partner ?? "—" },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between py-2 border-b border-[#1e1e2e] last:border-0">
                    <span className="text-[#555] text-sm">{row.label}</span>
                    <span className="text-[#ccc] text-sm">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
              <h2 className="text-white font-semibold mb-3">Hub</h2>
              {vehicle.hub_id ? (
                <Link href={`/hubs/${vehicle.hub_id}`} className="flex items-center justify-between group">
                  <div>
                    <p className="text-[#6C5CE7] font-medium group-hover:underline">{vehicle.hub_name}</p>
                    <p className="text-[#555] text-xs">{vehicle.hub_city}</p>
                  </div>
                  <span className="text-[#555] group-hover:text-white">→</span>
                </Link>
              ) : <p className="text-[#555] text-sm">No hub assigned</p>}
            </div>

            <VehicleInvestorCard
              vehicleId={vehicle.id}
              investorId={vehicle.investor_id ?? null}
              investorName={vehicle.investor_name ?? null}
              totalInvested={vehicle.total_invested ?? null}
              canEdit={isAdmin}
            />

            <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
              <h2 className="text-white font-semibold mb-3">Current Rider</h2>
              {activeAssignment ? (
                <Link href={`/riders/${activeAssignment.rider_id}`} className="flex items-center justify-between group">
                  <div>
                    <p className="text-[#fdcb6e] font-medium group-hover:underline">{activeAssignment.rider_name}</p>
                    <p className="text-[#555] text-xs">{activeAssignment.rider_mobile}</p>
                  </div>
                  <span className="text-[#555] group-hover:text-white">→</span>
                </Link>
              ) : <p className="text-[#555] text-sm">Not assigned</p>}
            </div>
          </div>
        </div>

        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1e1e2e]">
            <h2 className="text-white font-semibold">Assignment History</h2>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["Rider", "From", "To", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-[#555]">No assignments yet</td></tr>
              ) : assignments.map((a: { rider_id: string; rider_name: string; rider_mobile: string; assigned_date: string; returned_date: string; status: string }, i: number) => (
                <tr key={i} className="border-b border-[#1a1a2a]">
                  <td className="px-5 py-3">
                    <Link href={`/riders/${a.rider_id}`} className="text-[#6C5CE7] hover:underline">{a.rider_name}</Link>
                    <p className="text-[#555] text-xs">{a.rider_mobile}</p>
                  </td>
                  <td className="px-5 py-3 text-[#aaa] text-xs">{new Date(a.assigned_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-5 py-3 text-[#aaa] text-xs">{a.returned_date ? new Date(a.returned_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Active"}</td>
                  <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs capitalize ${statusColor[a.status] ?? "bg-gray-500/20 text-gray-400"}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1e1e2e]">
            <h2 className="text-white font-semibold">Investor Payout History</h2>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e2e]">
                {["Due Date", "Paid Date", "Amount", "Status"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-[11px] text-[#555] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-[#555]">No payouts yet</td></tr>
              ) : payouts.map((p: { due_date: string; paid_date: string; amount: number; status: string }, i: number) => (
                <tr key={i} className="border-b border-[#1a1a2a]">
                  <td className="px-5 py-3 text-[#aaa]">{new Date(p.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-5 py-3 text-[#aaa]">{p.paid_date ? new Date(p.paid_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3 text-[#00D1B2] font-semibold">₹{Number(p.amount).toLocaleString()}</td>
                  <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs capitalize ${payoutStatus[p.status] ?? "bg-gray-500/20 text-gray-400"}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

      </div>
    </DashboardLayout>
  );
}
