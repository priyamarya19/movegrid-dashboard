import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";
import LeadComments from "@/components/leads/LeadComments";
import BackButton from "@/components/BackButton";

async function getData(id: string) {
  const [lead, comments] = await Promise.all([
    pool.query(`SELECT * FROM ${schemas.leads}.leads WHERE id = $1`, [id]),
    pool.query(
      `SELECT id, author_name, author_role, comment, created_at
       FROM ${schemas.leads}.lead_comments
       WHERE lead_id = $1
       ORDER BY created_at ASC`,
      [id]
    ),
  ]);
  if (!lead.rows[0]) return null;
  return { lead: lead.rows[0], comments: comments.rows };
}

const typeColor: Record<string, string> = {
  investor: "bg-[#00D1B220] text-[#00D1B2]",
  rider: "bg-[#6C5CE720] text-[#6C5CE7]",
  fleet: "bg-[#fdcb6e20] text-[#fdcb6e]",
};

const statusColor: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  contacted: "bg-yellow-500/20 text-yellow-400",
  converted: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
};

const statusOptions = ["new", "contacted", "converted", "rejected"];

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const data = await getData(id);
  if (!data) notFound();

  // ops_manager cannot view investor leads
  if (session?.role === "ops_manager" && data.lead.type === "investor") redirect("/leads");

  const { lead, comments } = data;

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-3">
          <BackButton fallback="/leads" label="Leads" />
          <span className="text-[#333]">/</span>
          <span className="text-white text-sm">{lead.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-white text-2xl font-bold">{lead.name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${typeColor[lead.type] ?? "bg-gray-500/20 text-gray-400"}`}>{lead.type}</span>
            </div>
            <p className="text-[#666] text-sm">
              {lead.phone && <span>{lead.phone}</span>}
              {lead.email && <span> · {lead.email}</span>}
              {lead.city && <span> · {lead.city}</span>}
            </p>
            <p className="text-[#555] text-xs mt-1">
              Received {new Date(lead.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${statusColor[lead.status] ?? "bg-gray-500/20 text-gray-400"}`}>{lead.status}</span>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4">Contact Details</h2>
            {[
              { label: "Name", value: lead.name },
              { label: "Phone", value: lead.phone ?? "—" },
              { label: "Email", value: lead.email ?? "—" },
              { label: "City", value: lead.city ?? "—" },
              { label: "Lead Type", value: lead.type },
              { label: "Received On", value: new Date(lead.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2 border-b border-[#1e1e2e] last:border-0">
                <span className="text-[#555] text-sm">{row.label}</span>
                <span className="text-[#ccc] text-sm">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4">
              {lead.type === "investor" ? "Investment Details" : lead.type === "fleet" ? "Fleet Details" : "Rider Details"}
            </h2>
            {lead.type === "investor" && (
              <div className="flex justify-between py-2 border-b border-[#1e1e2e]">
                <span className="text-[#555] text-sm">Investment Range</span>
                <span className="text-[#00D1B2] text-sm font-semibold">{lead.amount ? "₹" + lead.amount : "—"}</span>
              </div>
            )}
            {lead.type === "fleet" && (
              <>
                <div className="flex justify-between py-2 border-b border-[#1e1e2e]">
                  <span className="text-[#555] text-sm">Fleet Size</span>
                  <span className="text-[#fdcb6e] text-sm font-semibold">{lead.fleet_size ?? "—"} vehicles</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#1e1e2e]">
                  <span className="text-[#555] text-sm">City</span>
                  <span className="text-[#ccc] text-sm">{lead.city ?? "—"}</span>
                </div>
              </>
            )}
            <div className="mt-4">
              <p className="text-[#555] text-xs uppercase tracking-wider mb-3">Update Status</p>
              <LeadComments leadId={id} initialStatus={lead.status} statusOptions={statusOptions} initialComments={comments} />
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
