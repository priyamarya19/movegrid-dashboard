import { sendEmail } from "@/lib/email";

// Emails server errors to the ops inbox. Wired from instrumentation.ts's
// onRequestError hook, so it fires for any unhandled error in a route handler,
// server action, or RSC render — on both UAT and prod.
//
// Requires MAIL_FROM (verified SES sender) in env; ERROR_ALERT_EMAIL overrides the
// default recipient. While the SES account is in sandbox, the recipient must be a
// verified address.
const RECIPIENT = process.env.ERROR_ALERT_EMAIL || "priyam@movegrid.in";
const ENV = process.env.RDS_ENV === "uat" ? "UAT" : "PROD";

// Only prod errors page the inbox. UAT is noisy (testing, stale-build stragglers)
// and isn't worth alerting on. Set ERROR_ALERT_UAT=1 to opt UAT alerts back in.
const ALERTS_ENABLED = ENV === "PROD" || process.env.ERROR_ALERT_UAT === "1";

// In-memory throttle: don't re-send the same error (same env + message + route)
// more than once per window, so a route that errors on every request can't flood
// the inbox. Per pm2 process, which is fine — each env is its own process.
const WINDOW_MS = 5 * 60 * 1000;
const lastSent = new Map<string, number>();

type ReqInfo = { path?: string; method?: string };
type CtxInfo = { routePath?: string; routeType?: string };

export async function reportServerError(err: unknown, request?: ReqInfo, context?: CtxInfo): Promise<void> {
  if (!ALERTS_ENABLED) return; // UAT alerts suppressed by default
  try {
    const e = (err ?? {}) as { message?: string; stack?: string; digest?: string };
    const message = e.message || String(err);
    const route = request?.path || context?.routePath || "(unknown)";
    const method = request?.method || "";

    const sig = `${ENV}|${message}|${route}`;
    const now = Date.now();
    const prev = lastSent.get(sig);
    if (prev && now - prev < WINDOW_MS) return; // throttled — already alerted recently
    lastSent.set(sig, now);
    if (lastSent.size > 500) for (const [k, t] of lastSent) if (now - t > WINDOW_MS) lastSent.delete(k);

    const subject = `[MoveGrid ${ENV}] Error: ${message.slice(0, 120)}`;
    const text = [
      `Environment : ${ENV}`,
      `Time (UTC)  : ${new Date().toISOString()}`,
      `Route       : ${method} ${route}`.trim(),
      context?.routeType ? `Route type  : ${context.routeType}` : "",
      e.digest ? `Digest      : ${e.digest}` : "",
      "",
      `Message: ${message}`,
      "",
      "Stack:",
      e.stack || "(no stack trace)",
      "",
      "— This alert is throttled to once per 5 min per unique error/route.",
    ].filter(Boolean).join("\n");

    await sendEmail({ to: RECIPIENT, subject, text });
  } catch {
    // Never let the error reporter itself throw inside the error hook.
  }
}
