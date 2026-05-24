import DashboardLayout from "@/components/DashboardLayout";
import HubsTable from "@/components/hubs/HubsTable";
import { getSession } from "@/lib/auth";

export default async function HubsPage() {
  const session = await getSession();
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <HubsTable role={session?.role ?? ""} />
    </DashboardLayout>
  );
}
