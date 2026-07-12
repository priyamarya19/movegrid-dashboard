import DashboardLayout from "@/components/DashboardLayout";
import CollectionsView from "@/components/collections/CollectionsView";
import { getWeeklyCollections, getChaseList } from "@/lib/collections";
import { getLedgerSummary } from "@/lib/rent";

// Live, per-request data behind auth — never statically prerender at build time
// (doing so runs the DB queries against whatever env the build resolves to).
export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const [summary, weekly, chase] = await Promise.all([
    getLedgerSummary(),
    getWeeklyCollections(),
    getChaseList(),
  ]);
  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <CollectionsView summary={summary} weekly={weekly} chase={chase} />
    </DashboardLayout>
  );
}
