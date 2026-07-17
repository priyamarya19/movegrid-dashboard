import { redirect } from "next/navigation";
import { getSession, userCanViewAllotments } from "@/lib/auth";
import DashboardShell from "@/components/DashboardShell";
import AdminHome from "@/components/home/AdminHome";
import OpsManagerHome from "@/components/home/OpsManagerHome";
import InvestorHome from "@/components/home/InvestorHome";
import HubInchargeHome from "@/components/home/HubInchargeHome";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const canViewAllotments = await userCanViewAllotments(session.userId);

  return (
    <DashboardShell role={session.role} name={session.name} canViewAllotments={canViewAllotments}>
      {session.role === "investor" ? (
        <InvestorHome userId={session.userId} />
      ) : session.role === "hub_incharge" ? (
        <HubInchargeHome name={session.name} />
      ) : session.role === "ops_manager" ? (
        <OpsManagerHome />
      ) : (
        <AdminHome role={session.role} name={session.name} />
      )}
    </DashboardShell>
  );
}
