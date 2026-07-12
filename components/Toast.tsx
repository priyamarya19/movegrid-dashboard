"use client";

// Minimal toast system. The dashboard had no way to tell the user a mutation
// failed — components did `if (res.ok) …` with no else, so a failed blacklist /
// role change / export silently looked like success. useToast().show(...) surfaces
// the result; wire it into every fetch that changes data.
import { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind };

const ToastContext = createContext<{ show: (message: string, kind?: ToastKind) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, kind }]);
    // Errors linger longer than confirmations — they're the ones you must read.
    const ttl = kind === "error" ? 6000 : 3500;
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[90vw]">
        {toasts.map((t) => {
          const tone =
            t.kind === "error"
              ? "border-accent-danger-alt/40 text-accent-danger-alt-text"
              : t.kind === "success"
                ? "border-accent-success/40 text-accent-success-text"
                : "border-default text-secondary";
          return (
            <div
              key={t.id}
              role="status"
              className={`bg-surface border ${tone} rounded-xl px-4 py-2.5 text-sm shadow-lg flex items-center gap-2 animate-[fadeIn_0.15s_ease]`}
            >
              <span aria-hidden>
                {t.kind === "error" ? "⚠️" : t.kind === "success" ? "✓" : "•"}
              </span>
              <span className="text-primary">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
