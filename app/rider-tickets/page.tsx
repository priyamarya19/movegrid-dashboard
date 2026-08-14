import { redirect } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import RiderTicketsQueue from "@/components/RiderTicketsQueue";
import { getSession } from "@/lib/auth";

export default async function RiderTicketsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <RiderTicketsQueue />
    </DashboardLayout>
  );
}
