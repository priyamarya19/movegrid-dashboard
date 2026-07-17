import DashboardLayout from "@/components/DashboardLayout";
import PendingWeekTable from "@/components/riders/PendingWeekTable";

export default function PendingWeekPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <PendingWeekTable />
    </DashboardLayout>
  );
}
