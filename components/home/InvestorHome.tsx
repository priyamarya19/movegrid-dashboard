import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

type Props = { userId: string };

async function getPortfolio(userId: string) {
  const vehicles = await pool.query(
    `SELECT v.id, v.vehicle_number, v.model, v.status
     FROM ${schemas.ops}.vehicles v
     WHERE v.investor_id = $1`,
    [userId]
  );

  return { vehicles: vehicles.rows };
}

export default async function InvestorHome({ userId }: Props) {
  const { vehicles } = await getPortfolio(userId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-2xl font-bold">My Portfolio</h1>
        <p className="text-gray-400 text-sm mt-1">Your invested vehicles and returns</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[#111118] border border-white/10 rounded-2xl p-5">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Vehicles Owned</p>
          <p className="text-3xl font-bold text-purple-400">{vehicles.length}</p>
        </div>
        <div className="bg-[#111118] border border-white/10 rounded-2xl p-5">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Active</p>
          <p className="text-3xl font-bold text-[#00C48C]">{vehicles.filter((v) => v.status === "active").length}</p>
        </div>
        <div className="bg-[#111118] border border-white/10 rounded-2xl p-5">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Idle</p>
          <p className="text-3xl font-bold text-yellow-400">{vehicles.filter((v) => v.status === "idle").length}</p>
        </div>
      </div>

      {/* Vehicles table */}
      <div className="bg-[#111118] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold">Your Vehicles</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Vehicle No.</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Model</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3 text-white font-medium">{v.vehicle_number}</td>
                  <td className="px-5 py-3 text-gray-400">{v.model ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      v.status === "active" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                    }`}>
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-gray-500">No vehicles assigned yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
