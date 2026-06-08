import DashboardLayout from "@/components/DashboardLayout";
import SupportForm from "@/components/support/SupportForm";

const points = [
  { title: "Investment & payouts", desc: "Questions about your returns, schedule or statements." },
  { title: "Your vehicles", desc: "Anything about the scooters in your portfolio." },
  { title: "Account & bank details", desc: "Help with your profile or bank verification." },
];

export default function SupportPage() {
  return (
    <DashboardLayout allowedRoles={["investor"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-white text-2xl font-bold">Support</h1>
          <p className="text-[#666] text-sm mt-1">Send us a message and we&apos;ll get back to you</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Info panel */}
          <div className="lg:col-span-2 bg-gradient-to-br from-[#0c1f18] to-[#12121A] border border-[#00C48C]/20 rounded-2xl p-6 flex flex-col">
            <div className="w-11 h-11 rounded-xl bg-[#00C48C]/15 flex items-center justify-center text-[#00C48C] mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h2 className="text-white font-semibold text-lg">We&apos;re here to help</h2>
            <p className="text-[#888] text-sm mt-2 leading-relaxed">
              Have a question about your investment? Send us a message and the MoveGrid team will get back to you. A copy is emailed to you for your records.
            </p>

            <div className="mt-6 space-y-4">
              {points.map((p) => (
                <div key={p.title} className="flex items-start gap-3">
                  <span className="mt-1 text-[#00C48C]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  <div>
                    <p className="text-[#ccc] text-sm font-medium">{p.title}</p>
                    <p className="text-[#666] text-xs mt-0.5">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-6">
              <div className="flex items-center gap-2 text-[#777] text-xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Typical response within 24 hours
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-3 bg-[#12121A] border border-[#1e1e2e] rounded-2xl p-6 lg:p-8">
            <SupportForm />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
