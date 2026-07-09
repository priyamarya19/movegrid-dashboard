import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "MoveGrid Dashboard",
  description: "MoveGrid Operations & Investor Dashboard",
  robots: { index: false, follow: false },
};

// Sets the theme class before first paint (from the same logic as lib/theme.tsx's
// getDefaultTheme) so there's no flash of the wrong theme on load. Kept as a
// manually-synced inline script since it must run before any module graph loads.
const noFlashScript = `(function(){try{
  var t = localStorage.getItem("mg_theme");
  if (t !== "light" && t !== "dark") {
    var h = (new Date().getUTCHours()*60+new Date().getUTCMinutes()+330)%1440/60;
    t = (h >= 8 && h < 20) ? "light" : "dark";
  }
  if (t === "light") document.documentElement.classList.add("light");
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-base text-primary" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
