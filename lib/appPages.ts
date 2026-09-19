// Canonical list of dashboard sections that can be enabled per-user in the
// mobile app's hamburger menu (Settings → Users). The app keeps its own
// key → native-screen mapping; a key with no native screen yet simply doesn't
// render in the menu until that screen ships. Keep keys stable — they're stored
// in auth.users.app_pages.
export const APP_PAGES = [
  { key: "collections", label: "Collections" },
  { key: "allotments", label: "Allotments" },
  { key: "hubs", label: "Hubs" },
  { key: "leads", label: "Leads" },
  { key: "forms", label: "Forms" },
  { key: "rent_waivers", label: "Rent Waivers" },
  { key: "investors", label: "Investors" },
  { key: "portfolio", label: "Portfolio" },
  { key: "finance", label: "Finance" },
  { key: "logs", label: "Audit Logs" },
  { key: "users", label: "Users" },
  { key: "support", label: "Support" },
  { key: "rider_tickets", label: "Rider Tickets" },
  // Unlike every other key here, 'recon' is NOT granted to admins automatically.
  // It opens an uploaded bank statement — investor funding, cheque deposits,
  // balances — so it takes the admin role AND a deliberate tick in Settings →
  // Users. Anyone not ticked does not see the tab and cannot call its routes.
  { key: "recon", label: "Recon (bank reconciliation)" },
] as const;

/** App Pages that an admin does not get merely by being an admin. */
export const STRICT_APP_PAGES: string[] = ["recon"];

export type AppPageKey = (typeof APP_PAGES)[number]["key"];
export const APP_PAGE_KEYS: string[] = APP_PAGES.map((p) => p.key);
