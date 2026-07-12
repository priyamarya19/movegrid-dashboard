"use client";

// Promise-based confirmation dialog. Usage:
//   const confirm = useConfirm();
//   if (await confirm({ title: "Approve waiver?", message: "…", confirmLabel: "Approve" })) doIt();
// Mounted once in DashboardShell (like the toast system). Money- and access-
// affecting actions must go through this so a misclick can't silently move money
// or change access.
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // red confirm button for destructive/irreversible actions
};

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface border border-default rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-primary font-semibold text-base">{opts.title}</h2>
            {opts.message && <p className="text-secondary text-sm mt-2">{opts.message}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => close(false)}
                className="px-4 py-2 rounded-xl text-sm border border-default text-secondary hover:text-primary transition-colors"
              >
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                autoFocus
                onClick={() => close(true)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-on-dark transition-opacity hover:opacity-90 ${
                  opts.danger ? "bg-accent-danger-alt" : "bg-accent-purple"
                }`}
              >
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
