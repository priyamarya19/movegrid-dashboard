// PII masking helpers for investor-facing views.

/** Mobile: first 2 and last 2 digits visible, everything in between masked (e.g. 95XXXXXX10). */
export function maskMobile(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return digits.slice(0, 2) + "X".repeat(digits.length - 4) + digits.slice(-2);
}

/** Aadhaar: only the last 4 digits visible, the rest masked (e.g. XXXXXXXX1234). Blank if absent. */
export function maskAadhaar(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return "X".repeat(digits.length - 4) + digits.slice(-4);
}

/** PAN: first 2 and last 2 visible, middle masked (e.g. AB••••••0A). "—" if absent. */
export function maskPan(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  if (s.length <= 4) return "•".repeat(s.length);
  return s.slice(0, 2) + "•".repeat(s.length - 4) + s.slice(-2);
}

/** Bank account: only the last 4 visible (e.g. •••• 1461). "—" if absent. */
export function maskAccount(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  if (s.length <= 4) return "•".repeat(s.length);
  return "•••• " + s.slice(-4);
}

/** Driving licence: first 2 and last 2 visible, middle masked. "—" if absent. */
export function maskDl(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  if (s.length <= 4) return "•".repeat(s.length);
  return s.slice(0, 2) + "•".repeat(s.length - 4) + s.slice(-2);
}
