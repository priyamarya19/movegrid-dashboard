// Single source of truth mapping dashboard labels/filters to the REAL stored
// vehicle.status values. The DB keeps the precise workflow vocabulary; the UI just
// maps its labels to those values here. No data is renamed.

// Dashboard concept -> actual stored status value
export const VSTATUS = {
  assigned: "assigned",
  available: "ready_to_deploy",   // "Available" means Ready to Deploy
  maintenance: "under_maintenance",
  returned: "returned",
} as const;

// Pseudo-status (not a real stored value): everything that isn't assigned or
// ready_to_deploy — maintenance, returned, retired, blocked, etc. The API special-cases
// this to an exclusion filter instead of an exact match.
export const NOT_AVAILABLE = "not_available";

// Status filter dropdown: visible label -> real status value sent to the API
export const VEHICLE_FILTERS: { label: string; value: string }[] = [
  { label: "All Status", value: "" },
  { label: "Assigned", value: VSTATUS.assigned },
  { label: "Available", value: VSTATUS.available },
  { label: "Not Available", value: NOT_AVAILABLE },
  { label: "Under Maintenance", value: VSTATUS.maintenance },
  { label: "Returned", value: VSTATUS.returned },
];

export const vehicleStatusColor: Record<string, string> = {
  assigned: "bg-green-500/20 text-green-400",
  ready_to_deploy: "bg-blue-500/20 text-blue-400",
  available: "bg-blue-500/20 text-blue-400",
  under_maintenance: "bg-yellow-500/20 text-yellow-400",
  maintenance: "bg-yellow-500/20 text-yellow-400",
  mechanically_ok: "bg-blue-500/20 text-blue-400",
  returned: "bg-orange-500/20 text-orange-400",
  retired: "bg-gray-500/20 text-gray-400",
  blocked: "bg-red-500/20 text-red-400",
};

export const vehicleStatusLabel = (s: string): string =>
  ({
    ready_to_deploy: "Ready to Deploy",
    under_maintenance: "Under Maintenance",
    mechanically_ok: "Mechanically OK",
  } as Record<string, string>)[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—");
