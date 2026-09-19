import type { ReconResult } from "@/lib/reconcile";

// Where a finished reconciliation lives between running it and sending it.
//
// Deliberately in memory and nowhere else. Priyam's instruction was that the
// statement is not to be stored — the email is the deliverable — so neither the
// uploaded file nor the workbook is written to S3 or the database. A run is held
// just long enough to download it and pick who to send it to, then it is gone.
//
// Consequences, accepted: a server restart loses any pending run (the user
// re-uploads, which costs seconds), and this does not survive across multiple
// app instances. Both are fine for one admin-only screen on a single process.

export type ReconRun = {
  token: string;
  createdAt: number;
  userId: string;
  runBy: string;
  meta: { from: string; to: string; stmtFrom: string; stmtTo: string; accountTail: string | null };
  result: ReconResult;
  workbook: Buffer;
  filename: string;
};

const TTL_MS = 15 * 60 * 1000;
const runs = new Map<string, ReconRun>();

function sweep() {
  const cutoff = Date.now() - TTL_MS;
  for (const [token, run] of runs) if (run.createdAt < cutoff) runs.delete(token);
}

export function putRun(run: Omit<ReconRun, "createdAt">): ReconRun {
  sweep();
  const full = { ...run, createdAt: Date.now() };
  runs.set(run.token, full);
  return full;
}

/** Returns the run only for the user who created it — a token is not a grant. */
export function getRun(token: string, userId: string): ReconRun | null {
  sweep();
  const run = runs.get(token);
  if (!run || run.userId !== userId) return null;
  return run;
}

export function dropRun(token: string) {
  runs.delete(token);
}

export const RUN_TTL_MINUTES = TTL_MS / 60000;
