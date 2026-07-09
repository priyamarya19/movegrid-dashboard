import { redirect } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import UsersManager from "@/components/settings/UsersManager";
import ChangePasswordForm from "@/components/settings/ChangePasswordForm";
import ReportRecipientsManager from "@/components/settings/ReportRecipientsManager";
import { getSession } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge", "investor"]}>
      <div className="space-y-6">
        <ChangePasswordForm />
        {session.role === "admin" && <UsersManager />}
        {session.role === "admin" && <ReportRecipientsManager />}
      </div>
    </DashboardLayout>
  );
}
