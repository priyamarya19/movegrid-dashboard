import { notFound } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import HubForm from "@/components/forms/HubForm";
import BackButton from "@/components/BackButton";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

export default async function EditHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await pool.query(`SELECT * FROM ${schemas.ops}.hubs WHERE id = $1`, [id]);
  const hub = res.rows[0];
  if (!hub) notFound();

  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <BackButton fallback={`/hubs/${id}`} label={hub.hub_name} />
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">Edit</span>
        </div>
        <div>
          <h1 className="text-primary text-2xl font-bold">Edit {hub.hub_name}</h1>
          <p className="text-muted text-sm mt-1">Update hub details, rider-facing address and ops contact</p>
        </div>
        <div className="bg-surface border border-default rounded-xl p-6">
          <HubForm hub={hub} />
        </div>
      </div>
    </DashboardLayout>
  );
}
