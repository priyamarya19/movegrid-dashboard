import DashboardLayout from "@/components/DashboardLayout";
import LogsTable from "@/components/logs/LogsTable";

export default async function LogsPage() {
  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <LogsTable />
    </DashboardLayout>
  );
}
