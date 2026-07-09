import DashboardLayout from "@/components/DashboardLayout";
import InvestorForm from "@/components/forms/InvestorForm";
import Link from "next/link";

export default function NewInvestorPage() {
  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/investors" className="text-muted hover:text-primary text-sm transition-colors">← Investors</Link>
          <span className="text-faint">/</span>
          <span className="text-primary text-sm">Add Investor</span>
        </div>
        <div>
          <h1 className="text-primary text-2xl font-bold">Add Investor</h1>
          <p className="text-muted text-sm mt-1">Onboard a new investor and create their login</p>
        </div>
        <div className="bg-surface border border-default rounded-xl p-6">
          <InvestorForm />
        </div>
      </div>
    </DashboardLayout>
  );
}
