import DashboardLayout from "@/components/DashboardLayout";
import InvestorForm from "@/components/forms/InvestorForm";
import Link from "next/link";

export default function NewInvestorPage() {
  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/investors" className="text-[#555] hover:text-white text-sm transition-colors">← Investors</Link>
          <span className="text-[#333]">/</span>
          <span className="text-white text-sm">Add Investor</span>
        </div>
        <div>
          <h1 className="text-white text-2xl font-bold">Add Investor</h1>
          <p className="text-[#666] text-sm mt-1">Onboard a new investor and create their login</p>
        </div>
        <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-6">
          <InvestorForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
