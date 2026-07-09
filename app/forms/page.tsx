import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

const allForms = [
  {
    title: "Rider Onboarding",
    description: "Register a new rider — KYC details, address, bank info, references and documents.",
    href: "/riders/new",
    color: "var(--accent-purple)",
    bg: "bg-accent-purple/13",
    roles: ["admin", "ops_manager", "hub_incharge"],
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><line x1="19" y1="8" x2="23" y2="8"/><line x1="21" y1="6" x2="21" y2="10"/></svg>,
  },
  {
    title: "Vehicle Onboarding",
    description: "Add a new scooter to the fleet — EV number, chassis, motor, IOT, battery details.",
    href: "/vehicles/new",
    color: "var(--accent-teal)",
    bg: "bg-accent-teal/13",
    roles: ["admin", "ops_manager"],
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/><circle cx="16" cy="17" r="2"/><circle cx="9" cy="17" r="2"/><line x1="19" y1="10" x2="23" y2="10"/><line x1="21" y1="8" x2="21" y2="12"/></svg>,
  },
  {
    title: "Rider Allotment",
    description: "Assign a vehicle to a rider — rental mode, amount collected, payment screenshot, allotment photos.",
    href: "/allotments/new",
    color: "var(--accent-warning)",
    bg: "bg-accent-warning/13",
    roles: ["admin", "ops_manager", "hub_incharge"],
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/><circle cx="16" cy="17" r="2"/><circle cx="9" cy="17" r="2"/><polyline points="16 5 19 8 22 5"/></svg>,
  },
  {
    title: "Vehicle Return / Submission",
    description: "Record a vehicle being returned — condition, rent status, penalty, return photos.",
    href: "/allotments/return",
    color: "var(--accent-danger)",
    bg: "bg-accent-danger/13",
    roles: ["admin", "ops_manager", "hub_incharge"],
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/><circle cx="16" cy="17" r="2"/><circle cx="9" cy="17" r="2"/><polyline points="22 5 19 8 16 5"/></svg>,
  },
  {
    title: "New Hub",
    description: "Register a new hub location — owner details, rent, security deposit, agreement.",
    href: "/hubs/new",
    color: "var(--accent-purple-2)",
    bg: "bg-accent-purple-2/13",
    roles: ["admin"],
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/><line x1="19" y1="9" x2="23" y2="9"/><line x1="21" y1="7" x2="21" y2="11"/></svg>,
  },
];

export default async function FormsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const visible = allForms.filter((f) => f.roles.includes(session.role));

  return (
    <DashboardLayout allowedRoles={["admin", "ops_manager", "hub_incharge"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-primary text-2xl font-bold">Operations Forms</h1>
          <p className="text-muted text-sm mt-1">Fill these forms to log entries directly into the system</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((form) => (
            <Link key={form.href} href={form.href} className="group bg-surface border border-default rounded-xl p-6 hover:border-strong hover:bg-surface-hover transition-all block">
              <div className={`w-11 h-11 rounded-xl ${form.bg} flex items-center justify-center mb-4`} style={{ color: form.color }}>
                {form.icon}
              </div>
              <h2 className="text-primary font-semibold text-base mb-1.5 group-hover:text-primary">{form.title}</h2>
              <p className="text-muted text-sm leading-relaxed">{form.description}</p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-medium" style={{ color: form.color }}>
                Open form
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-0.5 transition-transform"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
