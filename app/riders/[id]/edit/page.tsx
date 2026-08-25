import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import RiderForm from "@/components/forms/RiderForm";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession } from "@/lib/auth";

// Completing a rider's record after the fact. Riders created from a lead or by
// signing up in the app arrive with almost nothing filled in; this opens the
// onboarding form over what's already there.
export default async function EditRiderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const res = await pool.query(
    `SELECT id, name, nickname, mobile, current_address, permanent_address, address_map_link,
            aadhaar, aadhaar_front_url, aadhaar_back_url, pan, pan_image_url,
            dl_number, dl_front_url, dl_back_url, bank_doc_url,
            bank, ifsc, account_number,
            family_ref_name, family_ref_mobile, family_ref_aadhaar, family_ref_aadhaar_url,
            local_ref_name, local_ref_mobile,
            rental_mode, business_type, b2b_company, b2b_location, employer,
            onboarding_fee, security_deposit, assigned_hub_id,
            profile_photo_url, additional_photos, rider_code, created_by
       FROM ${schemas.ops}.riders WHERE id = $1`,
    [id]
  );
  const rider = res.rows[0];
  if (!rider) notFound();

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/riders/${id}`} className="text-muted hover:text-primary text-sm transition-colors">← {rider.name}</Link>
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">Edit</span>
        </div>
        <div>
          <h1 className="text-primary text-2xl font-bold">Edit {rider.name}</h1>
          <p className="text-muted text-sm mt-1">
            {rider.rider_code ?? "—"}
            {rider.created_by === "lead-backfill"
              ? " · came from a lead, so most fields were never captured"
              : ""}
          </p>
        </div>
        <div className="bg-surface border border-default rounded-xl p-6">
          <RiderForm rider={rider} riderId={id} />
        </div>
      </div>
    </DashboardLayout>
  );
}
