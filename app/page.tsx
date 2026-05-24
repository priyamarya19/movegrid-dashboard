import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import DashboardShell from "@/components/DashboardShell";
import AdminHome from "@/components/home/AdminHome";
import OpsManagerHome from "@/components/home/OpsManagerHome";
import InvestorHome from "@/components/home/InvestorHome";
import HubInchargeHome from "@/components/home/HubInchargeHome";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell role={session.role} name={session.name}>
      {session.role === "investor" ? (
        <InvestorHome userId={session.userId} />
      ) : session.role === "hub_incharge" ? (
        <HubInchargeHome name={session.name} />
      ) : session.role === "ops_manager" ? (
        <OpsManagerHome />
      ) : (
        <AdminHome role={session.role} />
      )}
    </DashboardShell>
  );
}
