"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import RentWaiverBanner from "@/components/RentWaiverBanner";
import { ToastProvider } from "@/components/Toast";

type Props = {
  role: string;
  name: string;
  children: React.ReactNode;
};

export default function DashboardShell({ role, name, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Session expiry check every 5 minutes
  useEffect(() => {
    const check = async () => {
      const res = await fetch("/api/auth/session");
      if (res.status === 401 || res.status === 403) {
        router.replace("/login");
      }
    };
    const interval = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <ToastProvider>
    <div className="flex h-screen overflow-hidden bg-base">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, static on desktop */}
      <div className={`
        fixed inset-y-0 left-0 z-30 transition-transform duration-300
        lg:relative lg:translate-x-0 lg:z-auto
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <Sidebar role={role} name={name} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <RentWaiverBanner />

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-surface-alt border-b border-default shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted hover:text-primary transition-colors p-1"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-accent-success rounded-md flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <span className="text-primary font-bold text-sm tracking-tight">MoveGrid</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col">
          <div className="flex-1">{children}</div>
          <Footer className="mt-8 pt-4" />
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}
