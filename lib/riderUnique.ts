import pool from "@/lib/db";
import { schemas } from "@/lib/schemas";

// Friendly pre-check for the one-identity-one-rider rule (migration 018 is the
// DB-level backstop). Returns a human message naming the conflicting field and
// rider code, or null when everything is free to use.
export async function riderIdentityConflict(args: {
  excludeRiderId?: string;
  mobile?: string;
  aadhaar?: string;
  pan?: string;
  accountNumber?: string;
}): Promise<string | null> {
  const S = schemas.ops;
  const checks: { field: string; label: string; sql: string; value: string }[] = [];

  if (args.mobile) {
    checks.push({
      field: "mobile", label: "Mobile number",
      sql: `RIGHT(REGEXP_REPLACE(mobile, '\\D', '', 'g'), 10) = $1`,
      value: args.mobile.replace(/\D/g, "").slice(-10),
    });
  }
  if (args.aadhaar) checks.push({ field: "aadhaar", label: "Aadhaar", sql: `aadhaar = $1`, value: args.aadhaar.replace(/\s/g, "") });
  if (args.pan) checks.push({ field: "pan", label: "PAN", sql: `UPPER(pan) = $1`, value: args.pan.trim().toUpperCase() });
  if (args.accountNumber) checks.push({ field: "account", label: "Bank account", sql: `account_number = $1`, value: args.accountNumber.replace(/\s/g, "") });

  for (const c of checks) {
    const res = await pool.query(
      `SELECT rider_code, name FROM ${S}.riders WHERE ${c.sql} ${args.excludeRiderId ? "AND id <> $2" : ""} LIMIT 1`,
      args.excludeRiderId ? [c.value, args.excludeRiderId] : [c.value]
    );
    if (res.rows[0]) {
      return `${c.label} is already registered with another rider (${res.rows[0].rider_code ?? res.rows[0].name}). Ek hi ${c.label.toLowerCase()} do riders ke saath nahi ho sakta.`;
    }
  }
  return null;
}

/** Postgres unique-violation → the same friendly wording, for race conditions. */
export function uniqueViolationMessage(e: unknown): string | null {
  const err = e as { code?: string; constraint?: string };
  if (err?.code !== "23505") return null;
  const map: Record<string, string> = {
    riders_mobile_unique: "Mobile number is already registered with another rider.",
    riders_aadhaar_unique: "Aadhaar is already registered with another rider.",
    riders_pan_unique: "PAN is already registered with another rider.",
    riders_account_unique: "Bank account is already registered with another rider.",
  };
  return map[err.constraint ?? ""] ?? null;
}
