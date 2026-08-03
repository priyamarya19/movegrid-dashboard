import DashboardLayout from "@/components/DashboardLayout";
import FinanceTabs from "@/components/finance/FinanceTabs";

export default function FinancePage() {
  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <FinanceTabs />
    </DashboardLayout>
  );
}
