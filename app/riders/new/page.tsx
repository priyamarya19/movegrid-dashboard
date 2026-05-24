import DashboardLayout from "@/components/DashboardLayout";
import RiderForm from "@/components/forms/RiderForm";
import Link from "next/link";

export default function NewRiderPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forms" className="text-[#555] hover:text-white text-sm transition-colors">← Forms</Link>
          <span className="text-[#333]">/</span>
          <span className="text-white text-sm">Rider Onboarding</span>
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold">Rider Onboarding</h1>
          <p className="text-[#666] text-sm mt-1">Register a new rider into the system</p>
        </div>
        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-6">
          <RiderForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
