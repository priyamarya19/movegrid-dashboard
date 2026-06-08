import { Suspense } from "react";
import Link from "next/link";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import Footer from "@/components/Footer";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 relative">
      <Footer className="absolute bottom-4 inset-x-0 px-4" />
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-[#00C48C] rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">MoveGrid</span>
          </div>
          <h1 className="text-white text-2xl font-bold">Set New Password</h1>
          <p className="text-gray-400 text-sm mt-1">Choose a strong password for your account</p>
        </div>

        <Suspense fallback={
          <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 text-center">
            <p className="text-gray-400 text-sm">Loading...</p>
          </div>
        }>
          <ResetPasswordForm />
        </Suspense>

        <p className="text-center text-xs text-gray-600 mt-6">
          MoveGrid Technologies Pvt Ltd · Internal Use Only
        </p>
      </div>
    </div>
  );
}
