import DashboardLayout from "@/components/DashboardLayout";
import FinanceSummary from "@/components/finance/FinanceSummary";

export default function FinancePage() {
  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <FinanceSummary />
    </DashboardLayout>
  );
}
