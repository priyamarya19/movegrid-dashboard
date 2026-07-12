// Single source of truth for the JWT signing secret.
//
// Previously each auth file did `process.env.JWT_SECRET || "fallback_secret"`,
// which meant a deployment with the env var unset would silently sign and accept
// tokens with a publicly-known secret — anyone reading the repo could forge an
// admin token. We now fail loudly at module load instead: a missing secret is a
// misconfiguration that must stop the deploy, never degrade to a guessable key.
//
// Safe to import from Edge middleware (proxy.ts) — only uses TextEncoder + env.
const raw = process.env.JWT_SECRET;
if (!raw || raw.length < 16) {
  throw new Error(
    "JWT_SECRET is missing or too short (need >=16 chars). Set it in the environment; " +
      "there is no fallback — refusing to sign tokens with a guessable key."
  );
}

export const JWT_SECRET = new TextEncoder().encode(raw);
