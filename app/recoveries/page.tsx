import DashboardLayout from "@/components/DashboardLayout";
import RecoveriesTable from "@/components/RecoveriesTable";

export default function RecoveriesPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <RecoveriesTable />
    </DashboardLayout>
  );
}
