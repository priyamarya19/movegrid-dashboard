import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import VehicleForm from "@/components/forms/VehicleForm";
import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";
import { getSession, canEditVehicleDetails } from "@/lib/auth";

// Correcting a vehicle's identity and hardware record. Chassis, motor,
// controller, IMEI and battery numbers are transcribed by hand at intake, so
// typos are common and currently uncorrectable without a DB query.
//
// Admins reach this by default; anyone else needs the "Edit Vehicle Details"
// App Page ticked against their user. The same check runs again in the PATCH
// route — the page gate only hides the form, it does not protect the data.
export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  if (!(await canEditVehicleDetails(session))) redirect(`/vehicles/${id}`);

  const res = await pool.query(
    `SELECT v.id, v.ev_number, v.chassis_number, v.motor_number, v.controller_number,
            v.iot_imei, v.iot_partner, v.battery_number, v.battery_partner,
            v.hub_id, v.price, v.vehicle_photo_url, v.rc_book_url, v.vehicle_photos,
            to_char(v.purchase_date, 'YYYY-MM-DD') AS purchase_date,
            m.oem, m.model_name
       FROM ${schemas.ops}.vehicles v
       LEFT JOIN ${schemas.ops}.vehicle_models m ON m.id = v.model_id
      WHERE v.id = $1`,
    [id]
  );
  const vehicle = res.rows[0];
  if (!vehicle) notFound();

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/vehicles/${id}`} className="text-muted hover:text-primary text-sm transition-colors">
            ← {vehicle.ev_number}
          </Link>
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">Edit</span>
        </div>
        <div>
          <h1 className="text-primary text-2xl font-bold">Edit {vehicle.ev_number}</h1>
          <p className="text-muted text-sm mt-1">
            {vehicle.model_name ? `${vehicle.model_name} · ` : ""}
            Every change is recorded in the audit log with its previous value.
          </p>
        </div>
        <div className="bg-surface border border-default rounded-xl p-6">
          <VehicleForm vehicle={vehicle} vehicleId={id} />
        </div>
      </div>
    </DashboardLayout>
  );
}
