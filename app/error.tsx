"use client";

// Themed root error boundary. Previously an uncaught error in any server page
// (e.g. a DB hiccup) rendered Next's default unstyled error screen; now it shows
// a branded page with a retry that re-runs the failed render.
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard render error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4">
      <div className="bg-surface border border-default rounded-2xl p-8 max-w-md text-center">
        <div className="flex items-center justify-center w-12 h-12 bg-accent-danger-alt/15 rounded-full mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger-alt-text)" strokeWidth="2">
            <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h1 className="text-primary text-lg font-semibold">Something went wrong</h1>
        <p className="text-muted text-sm mt-1">
          This page couldn&apos;t load. It&apos;s usually temporary — try again.
        </p>
        <button
          onClick={reset}
          className="mt-5 px-4 py-2 rounded-xl text-sm font-semibold bg-accent-purple text-on-dark hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
