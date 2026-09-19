import { redirect } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import ReconView from "@/components/recon/ReconView";
import { getSession } from "@/lib/auth";
import { canRunRecon } from "@/lib/reconAccess";

// Admin role AND the Recon grant. The uploaded statement carries every credit
// in the account — investor funding, cheque deposits, balances — not just rider
// money, so this is the one page an admin does not get by being an admin.
//
// Checked here as well as in the routes: hiding the tab is presentation, and
// anyone can type a URL.
export const dynamic = "force-dynamic";

export default async function ReconPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await canRunRecon(session.userId, session.role))) redirect("/");

  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <ReconView />
    </DashboardLayout>
  );
}
