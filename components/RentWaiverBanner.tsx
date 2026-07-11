"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Self-detects authorization: a 403 from /api/rent-waivers means this user doesn't
// have can_approve_rent_waivers, so the banner renders nothing for them at all —
// no separate "am I allowed to see this" check needed.
export default function RentWaiverBanner() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch("/api/rent-waivers")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setCount(Array.isArray(rows) ? rows.length : 0))
      .catch(() => setCount(0));
  }, []);

  if (count === 0) return null;

  return (
    <Link
      href="/rent-waivers"
      className="flex items-center justify-center gap-2 bg-accent-warning/13 border-b border-accent-warning text-accent-warning-text text-sm font-medium px-4 py-2.5 hover:bg-accent-warning/20 transition-colors shrink-0"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {count} rent waiver request{count !== 1 ? "s" : ""} awaiting your approval — review now
    </Link>
  );
}
