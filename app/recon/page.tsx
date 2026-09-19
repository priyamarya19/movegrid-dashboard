import DashboardLayout from "@/components/DashboardLayout";
import ReconView from "@/components/recon/ReconView";

// Admin only: the uploaded statement carries every credit in the account —
// investor funding, cheque deposits, balances — not just rider money.
export const dynamic = "force-dynamic";

export default function ReconPage() {
  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <ReconView />
    </DashboardLayout>
  );
}
