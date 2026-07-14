import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import pool from "@/lib/db";
import { dateIN, dateTimeIN } from "@/lib/format";
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
  investor: "bg-accent-teal/13 text-accent-teal",
  rider: "bg-accent-purple/13 text-accent-purple",
  fleet: "bg-accent-warning/13 text-accent-warning",
};

const statusColor: Record<string, string> = {
  new: "bg-accent-purple-2/15 text-accent-purple-2-text",
  contacted: "bg-accent-warning/20 text-accent-warning-text",
  converted: "bg-accent-success/20 text-accent-success-text",
  rejected: "bg-accent-danger-alt/20 text-accent-danger-alt-text",
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
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">{lead.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-primary text-2xl font-bold">{lead.name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${typeColor[lead.type] ?? "bg-muted/20 text-muted"}`}>{lead.type}</span>
            </div>
            <p className="text-muted text-sm">
              {lead.phone && <span>{lead.phone}</span>}
              {lead.email && <span> · {lead.email}</span>}
              {lead.city && <span> · {lead.city}</span>}
            </p>
            <p className="text-muted text-xs mt-1">
              Received {dateTimeIN(lead.created_at)}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${statusColor[lead.status] ?? "bg-muted/20 text-muted"}`}>{lead.status}</span>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-default rounded-xl p-5">
            <h2 className="text-primary font-semibold mb-4">Contact Details</h2>
            {[
              { label: "Name", value: lead.name },
              { label: "Phone", value: lead.phone ?? "—" },
              { label: "Email", value: lead.email ?? "—" },
              { label: "City", value: lead.city ?? "—" },
              { label: "Lead Type", value: lead.type },
              { label: "Received On", value: dateIN(lead.created_at, { day: "numeric", month: "short", year: "numeric" }) },
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2 border-b border-default last:border-0">
                <span className="text-muted text-sm">{row.label}</span>
                <span className="text-secondary text-sm">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="bg-surface border border-default rounded-xl p-5">
            <h2 className="text-primary font-semibold mb-4">
              {lead.type === "investor" ? "Investment Details" : lead.type === "fleet" ? "Fleet Details" : "Rider Details"}
            </h2>
            {lead.type === "investor" && (
              <div className="flex justify-between py-2 border-b border-default">
                <span className="text-muted text-sm">Investment Range</span>
                <span className="text-accent-teal text-sm font-semibold">{lead.amount ? "₹" + lead.amount : "—"}</span>
              </div>
            )}
            {lead.type === "fleet" && (
              <>
                <div className="flex justify-between py-2 border-b border-default">
                  <span className="text-muted text-sm">Fleet Size</span>
                  <span className="text-accent-warning text-sm font-semibold">{lead.fleet_size ?? "—"} vehicles</span>
                </div>
                <div className="flex justify-between py-2 border-b border-default">
                  <span className="text-muted text-sm">City</span>
                  <span className="text-secondary text-sm">{lead.city ?? "—"}</span>
                </div>
              </>
            )}
            <div className="mt-4">
              <p className="text-muted text-xs uppercase tracking-wider mb-3">Update Status</p>
              <LeadComments leadId={id} initialStatus={lead.status} statusOptions={statusOptions} initialComments={comments} />
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
