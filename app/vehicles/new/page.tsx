import DashboardLayout from "@/components/DashboardLayout";
import VehicleForm from "@/components/forms/VehicleForm";
import Link from "next/link";

export default function NewVehiclePage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forms" className="text-muted hover:text-primary text-sm transition-colors">← Forms</Link>
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">Vehicle Onboarding</span>
        </div>
        <div>
          <h1 className="text-primary text-2xl font-bold">Vehicle Onboarding</h1>
          <p className="text-muted text-sm mt-1">Add a new scooter to the fleet</p>
        </div>
        <div className="bg-surface border border-default rounded-xl p-6">
          <VehicleForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
