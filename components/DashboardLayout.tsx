import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import DashboardShell from "@/components/DashboardShell";

type Props = {
  children: React.ReactNode;
  allowedRoles?: string[];
};

export default async function DashboardLayout({ children, allowedRoles }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (allowedRoles && !allowedRoles.includes(session.role)) redirect("/");

  return (
    <DashboardShell role={session.role} name={session.name}>
      {children}
    </DashboardShell>
  );
}
