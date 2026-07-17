import { redirect } from "next/navigation";
import { getSession, userCanViewAllotments } from "@/lib/auth";
import DashboardShell from "@/components/DashboardShell";

type Props = {
  children: React.ReactNode;
  allowedRoles?: string[];
  // When true, only users with the can_view_allotments permission may see the page.
  requireAllotments?: boolean;
};

export default async function DashboardLayout({ children, allowedRoles, requireAllotments }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (allowedRoles && !allowedRoles.includes(session.role)) redirect("/");

  const canViewAllotments = await userCanViewAllotments(session.userId);
  if (requireAllotments && !canViewAllotments) redirect("/");

  return (
    <DashboardShell role={session.role} name={session.name} canViewAllotments={canViewAllotments}>
      {children}
    </DashboardShell>
  );
}
