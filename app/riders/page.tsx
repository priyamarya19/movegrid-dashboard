import DashboardLayout from "@/components/DashboardLayout";
import RidersTable from "@/components/riders/RidersTable";

export default async function RidersPage({ searchParams }: { searchParams: Promise<{ rent?: string; status?: string }> }) {
  const params = await searchParams;
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <RidersTable rentFilter={params.rent ?? null} statusFilter={params.status ?? null} />
    </DashboardLayout>
  );
}
