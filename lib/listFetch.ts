// Shared fetch for the paginated list tables. Guarantees the caller always gets
// an array (never crashes on .map/.reduce), sends the user to log in on a 401
// (e.g. an expired/revoked session after a deploy), and reports other failures
// so the table can show an inline error instead of throwing into the error page.
export type ListResult<T> = {
  ok: boolean;
  rows: T[];
  total: number | null;
  counts: Record<string, number> | null;
};

export async function fetchList<T>(url: string): Promise<ListResult<T>> {
  const empty: ListResult<T> = { ok: false, rows: [], total: null, counts: null };
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return empty; // network error
  }

  // Session expired or revoked → bounce to login so a fresh token is issued.
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return empty;
  }
  if (!res.ok) return empty;

  const totalHeader = res.headers.get("X-Total-Count");
  const scHeader = res.headers.get("X-Status-Counts");
  let counts: Record<string, number> | null = null;
  if (scHeader) { try { counts = JSON.parse(scHeader); } catch { counts = null; } }

  let data: unknown = [];
  try { data = await res.json(); } catch { data = []; }

  return {
    ok: true,
    rows: Array.isArray(data) ? (data as T[]) : [],
    total: totalHeader ? Number(totalHeader) : null,
    counts,
  };
}
