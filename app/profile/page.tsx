import { redirect } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { getSession } from "@/lib/auth";
import { getPortfolioByUser } from "@/lib/portfolio";
import BankDetailsForm from "@/components/investors/BankDetailsForm";

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
          <h1 className="text-white text-2xl font-bold">My Profile</h1>
          <p className="text-[#666] text-sm mt-1">Your account and bank details</p>
        </div>

        {!portfolio ? (
          <div className="bg-[#12121A] border border-[#1e1e2e] rounded-2xl p-10 text-center">
            <p className="text-[#aaa]">Your investor profile isn&apos;t set up yet.</p>
            <p className="text-[#555] text-sm mt-1">Please contact the MoveGrid team to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Personal details */}
            <div className="bg-[#12121A] border border-[#1e1e2e] rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4">Personal Details</h2>
              {[
                { label: "Name", value: session.name },
                { label: "Email", value: session.email },
                { label: "PAN", value: portfolio.profile.pan ?? "—" },
                { label: "Aadhaar", value: maskAadhaar(portfolio.profile.aadhaar) },
                { label: "Total Invested", value: "₹" + Number(portfolio.profile.total_invested).toLocaleString() },
                { label: "Investment Date", value: fmtDate(portfolio.profile.investment_date) },
                { label: "Status", value: portfolio.profile.status },
              ].map((row) => (
                <div key={row.label} className="flex justify-between py-2 border-b border-[#1e1e2e] last:border-0">
                  <span className="text-[#555] text-sm">{row.label}</span>
                  <span className="text-[#ccc] text-sm capitalize">{row.value}</span>
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
