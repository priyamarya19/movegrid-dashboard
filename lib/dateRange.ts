// Shared date-range presets for the Allotments and Collections filters.
// Boundaries are computed in IST so "today" matches the ops team's day.
// `col` is a trusted internal column expression (never user input); from/to are
// validated as YYYY-MM-DD before interpolation, so this is injection-safe.
const IST = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

export const RANGE_PRESETS = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "mtd", label: "Month to date" },
  { key: "custom", label: "Custom range" },
] as const;

const isISODate = (s?: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Returns a SQL boolean condition restricting `col` to the requested range.
// Unknown/"all" ranges (and a custom range with no valid dates) return "TRUE".
export function rangeCondition(col: string, range?: string | null, from?: string | null, to?: string | null): string {
  switch (range) {
    case "today": return `${col} = ${IST}`;
    case "yesterday": return `${col} = ${IST} - 1`;
    case "last7": return `${col} >= ${IST} - 6`;
    case "mtd": return `${col} >= date_trunc('month', ${IST})::date`;
    case "custom":
      if (isISODate(from) && isISODate(to)) return `${col} BETWEEN DATE '${from}' AND DATE '${to}'`;
      if (isISODate(from)) return `${col} >= DATE '${from}'`;
      if (isISODate(to)) return `${col} <= DATE '${to}'`;
      return "TRUE";
    default: return "TRUE";
  }
}
