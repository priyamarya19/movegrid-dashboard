import DashboardLayout from "@/components/DashboardLayout";
import DueSoonTable from "@/components/riders/DueSoonTable";

export default function DueSoonPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <DueSoonTable />
    </DashboardLayout>
  );
}
