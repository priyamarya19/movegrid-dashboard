"use client";

import { useState } from "react";

export default function AadhaarImageViewer({ imageKey }: { imageKey: string }) {
  const [open, setOpen] = useState(false);
  const src = `/api/file?key=${encodeURIComponent(imageKey)}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="View Aadhaar image"
        className="text-accent-purple hover:text-accent-purple-2 transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-primary text-sm font-medium">Aadhaar</span>
              <button onClick={() => setOpen(false)} className="text-secondary hover:text-primary">✕</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Aadhaar" className="w-full rounded-xl border border-default bg-surface" />
          </div>
        </div>
      )}
    </>
  );
}
