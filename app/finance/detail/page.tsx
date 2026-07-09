import DashboardLayout from "@/components/DashboardLayout";
import FinanceDetail from "@/components/finance/FinanceDetail";

export default async function FinanceDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; bucket?: string }>;
}) {
  const params = await searchParams;
  return (
    <DashboardLayout allowedRoles={["admin"]}>
      <FinanceDetail source={params.source ?? "total"} bucket={params.bucket ?? "tillDate"} />
    </DashboardLayout>
  );
}
