import { redirect } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { getSession } from "@/lib/auth";
import { getPortfolioByUser } from "@/lib/portfolio";
import BankDetailsForm from "@/components/investors/BankDetailsForm";
import AadhaarImageViewer from "@/components/investors/AadhaarImageViewer";

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const maskAadhaar = (a: string | null) =>
  a ? "XXXX XXXX " + a.slice(-4) : "—";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "investor") redirect("/");

  const portfolio = await getPortfolioByUser(session.userId);

  return (
    <DashboardLayout allowedRoles={["investor"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-primary text-2xl font-bold">My Profile</h1>
          <p className="text-muted text-sm mt-1">Your account and bank details</p>
        </div>

        {!portfolio ? (
          <div className="bg-surface border border-default rounded-2xl p-10 text-center">
            <p className="text-secondary">Your investor profile isn&apos;t set up yet.</p>
            <p className="text-muted text-sm mt-1">Please contact the MoveGrid team to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Personal details */}
            <div className="bg-surface border border-default rounded-xl p-5">
              <h2 className="text-primary font-semibold mb-4">Personal Details</h2>
              {([
                { label: "Name", value: session.name },
                { label: "Email", value: session.email },
                { label: "PAN", value: portfolio.profile.pan ?? "—" },
                { label: "Aadhaar", value: maskAadhaar(portfolio.profile.aadhaar), icon: portfolio.profile.aadhaar_url ? <AadhaarImageViewer imageKey={portfolio.profile.aadhaar_url} /> : null },
                { label: "Total Invested", value: "₹" + Number(portfolio.profile.total_invested).toLocaleString() },
                { label: "Investment Date", value: fmtDate(portfolio.profile.investment_date) },
                { label: "Status", value: portfolio.profile.status },
              ] as { label: string; value: string; icon?: React.ReactNode }[]).map((row) => (
                <div key={row.label} className="flex justify-between py-2 border-b border-default last:border-0">
                  <span className="text-muted text-sm">{row.label}</span>
                  <span className="text-secondary text-sm capitalize flex items-center gap-2">{row.value}{row.icon}</span>
                </div>
              ))}
            </div>

            {/* Bank details (editable) */}
            <BankDetailsForm
              bank={portfolio.profile.bank}
              ifsc={portfolio.profile.ifsc}
              accountNumber={portfolio.profile.account_number}
              bankStatus={portfolio.profile.bank_status}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
