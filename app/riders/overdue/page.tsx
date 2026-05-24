import DashboardLayout from "@/components/DashboardLayout";
import OverdueTable from "@/components/riders/OverdueTable";

export default function OverduePage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <OverdueTable />
    </DashboardLayout>
  );
}
