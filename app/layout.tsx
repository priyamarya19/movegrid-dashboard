import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoveGrid Dashboard",
  description: "MoveGrid Operations & Investor Dashboard",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#0A0A0F] text-white">{children}</body>
    </html>
  );
}
