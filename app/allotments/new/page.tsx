import DashboardLayout from "@/components/DashboardLayout";
import AllotmentForm from "@/components/forms/AllotmentForm";
import Link from "next/link";

export default function NewAllotmentPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forms" className="text-muted hover:text-primary text-sm transition-colors">← Forms</Link>
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">Rider Allotment</span>
        </div>
        <div>
          <h1 className="text-primary text-2xl font-bold">Rider Allotment</h1>
          <p className="text-muted text-sm mt-1">Assign a scooter to a rider</p>
        </div>
        <div className="bg-surface border border-default rounded-xl p-6">
          <AllotmentForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
