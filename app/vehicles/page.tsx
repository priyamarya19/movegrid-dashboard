import DashboardLayout from "@/components/DashboardLayout";
import VehiclesTable from "@/components/vehicles/VehiclesTable";

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <VehiclesTable statusFilter={params.status ?? null} />
    </DashboardLayout>
  );
}
