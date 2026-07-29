import { redirect } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import PaymentClaimsQueue from "@/components/PaymentClaimsQueue";
import { getSession } from "@/lib/auth";

export default async function PaymentClaimsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <PaymentClaimsQueue />
    </DashboardLayout>
  );
}
