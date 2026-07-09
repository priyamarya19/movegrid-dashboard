"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "dark",
  toggleTheme: () => {},
});

function getDefaultTheme(): Theme {
  // IST = UTC+5:30. Light between 08:00-20:00 IST, dark otherwise.
  const now = new Date();
  const istHour = ((now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % (24 * 60)) / 60;
  return istHour >= 8 && istHour < 20 ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // Respect explicit user preference; otherwise use time-based default.
    const saved = localStorage.getItem("mg_theme") as Theme | null;
    setTheme(saved === "light" || saved === "dark" ? saved : getDefaultTheme());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("mg_theme", next);
      return next;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// Canvas-based libraries (Chart.js) can't read CSS var() directly — resolve the
// computed value instead. SSR-safe (falls back to the dark default until hydrated).
export function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
