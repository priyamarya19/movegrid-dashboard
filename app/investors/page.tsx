import DashboardLayout from "@/components/DashboardLayout";
import InvestorsTable from "@/components/investors/InvestorsTable";

export default async function InvestorsPage() {
  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <InvestorsTable />
    </DashboardLayout>
  );
}
