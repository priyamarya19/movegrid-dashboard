import DashboardLayout from "@/components/DashboardLayout";
import PendingRentTable from "@/components/collections/PendingRentTable";

export default function CollectionsPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <PendingRentTable />
    </DashboardLayout>
  );
}
