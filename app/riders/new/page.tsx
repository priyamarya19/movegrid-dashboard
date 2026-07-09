import DashboardLayout from "@/components/DashboardLayout";
import RiderForm from "@/components/forms/RiderForm";
import Link from "next/link";

export default function NewRiderPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forms" className="text-muted hover:text-primary text-sm transition-colors">← Forms</Link>
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">Rider Onboarding</span>
        </div>
        <div>
          <h1 className="text-primary text-2xl font-bold">Rider Onboarding</h1>
          <p className="text-muted text-sm mt-1">Register a new rider into the system</p>
        </div>
        <div className="bg-surface border border-default rounded-xl p-6">
          <RiderForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
