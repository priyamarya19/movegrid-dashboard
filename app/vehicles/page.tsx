import DashboardLayout from "@/components/DashboardLayout";
import VehiclesTable from "@/components/vehicles/VehiclesTable";

export default async function VehiclesPage() {
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <VehiclesTable />
    </DashboardLayout>
  );
}
