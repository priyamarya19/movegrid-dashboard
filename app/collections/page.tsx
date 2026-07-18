import DashboardLayout from "@/components/DashboardLayout";
import CollectionsView from "@/components/collections/CollectionsView";
import CollectionsTabs from "@/components/collections/CollectionsTabs";
import { getWeeklyCollections, getChaseList } from "@/lib/collections";
import { getLedgerSummary } from "@/lib/rent";
import { getSession, userCanViewAllotments } from "@/lib/auth";

// Live, per-request data behind auth — never statically prerender at build time
// (doing so runs the DB queries against whatever env the build resolves to).
export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const [summary, weekly, chase, session] = await Promise.all([
    getLedgerSummary(),
    getWeeklyCollections(),
    getChaseList(),
    getSession(),
  ]);
  const canViewPayments = session ? await userCanViewAllotments(session.userId) : false;
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <CollectionsTabs
        canViewPayments={canViewPayments}
        overview={<CollectionsView summary={summary} weekly={weekly} chase={chase} />}
      />
    </DashboardLayout>
  );
}
