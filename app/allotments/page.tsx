import DashboardLayout from "@/components/DashboardLayout";
import AllotmentsTable from "@/components/allotments/AllotmentsTable";

export default function AllotmentsPage() {
  return (
    <DashboardLayout requireAllotments>
      <AllotmentsTable />
    </DashboardLayout>
  );
}
