import DashboardLayout from "@/components/DashboardLayout";
import HubForm from "@/components/forms/HubForm";
import Link from "next/link";

export default function NewHubPage() {
  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forms" className="text-[#555] hover:text-white text-sm transition-colors">← Forms</Link>
          <span className="text-[#333]">/</span>
          <span className="text-white text-sm">New Hub</span>
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold">New Hub</h1>
          <p className="text-[#666] text-sm mt-1">Register a new hub location</p>
        </div>
        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-6">
          <HubForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
