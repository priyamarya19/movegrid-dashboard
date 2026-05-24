import DashboardLayout from "@/components/DashboardLayout";
import LeadsTable from "@/components/leads/LeadsTable";

export default async function LeadsPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager"]}>
      <LeadsTable />
    </DashboardLayout>
  );
}
