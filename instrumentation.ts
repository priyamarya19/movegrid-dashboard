// Next.js instrumentation. onRequestError fires for any unhandled server-side
// error (route handlers, server actions, RSC renders) — the single choke point we
// use to email an alert on every error, on both UAT and prod.
export async function register() {
  // no startup instrumentation needed; onRequestError below does the work.
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string }
): Promise<void> {
  // AWS SES (and the alert helper) only run in the Node.js runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { reportServerError } = await import("@/lib/error-alert");
    await reportServerError(error, request, context);
  } catch {
    // Reporting must never itself break request handling.
  }
}
