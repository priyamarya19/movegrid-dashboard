import { redirect } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import RentWaiverReview from "@/components/RentWaiverReview";
import { getSession } from "@/lib/auth";

export default async function RentWaiversPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge", "investor"]}>
      <RentWaiverReview />
    </DashboardLayout>
  );
}
