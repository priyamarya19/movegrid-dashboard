import DashboardLayout from "@/components/DashboardLayout";
import VehicleReturnForm from "@/components/forms/VehicleReturnForm";
import Link from "next/link";

export default function VehicleReturnPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forms" className="text-muted hover:text-primary text-sm transition-colors">← Forms</Link>
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">Vehicle Return</span>
        </div>
        <div>
          <h1 className="text-primary text-2xl font-bold">Vehicle Return / Submission</h1>
          <p className="text-muted text-sm mt-1">Record a vehicle being returned by a rider</p>
        </div>
        <div className="bg-surface border border-default rounded-xl p-6">
          <VehicleReturnForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
