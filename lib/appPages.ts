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
] as const;

export type AppPageKey = (typeof APP_PAGES)[number]["key"];
export const APP_PAGE_KEYS: string[] = APP_PAGES.map((p) => p.key);
