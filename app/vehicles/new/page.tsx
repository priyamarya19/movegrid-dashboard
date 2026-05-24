import DashboardLayout from "@/components/DashboardLayout";
import VehicleForm from "@/components/forms/VehicleForm";
import Link from "next/link";

export default function NewVehiclePage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forms" className="text-[#555] hover:text-white text-sm transition-colors">← Forms</Link>
          <span className="text-[#333]">/</span>
          <span className="text-white text-sm">Vehicle Onboarding</span>
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold">Vehicle Onboarding</h1>
          <p className="text-[#666] text-sm mt-1">Add a new scooter to the fleet</p>
        </div>
        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-6">
          <VehicleForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
