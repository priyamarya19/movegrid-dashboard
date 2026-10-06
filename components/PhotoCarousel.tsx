"use client";

import { useCallback, useEffect, useState } from "react";

// "View pictures" — a link that opens the photos for one tenancy in a dialog,
// one at a time.
//
// Grouped rather than a flat strip, because the question these answer is always
// comparative: what the scooter looked like going out against what came back.
// The caption names which is which, and the handover set is listed first so
// stepping forward walks the scooter's life in order.

export type PhotoGroup = { label: string; keys: (string | null | undefined)[] };

const fileUrl = (key: string) => `/api/file?key=${encodeURIComponent(key)}`;

export default function PhotoCarousel({
  groups,
  label = "View pictures",
  className = "",
}: {
  groups: PhotoGroup[];
  label?: string;
  className?: string;
}) {
  // Flatten to a single walk, keeping each photo's caption with it.
  const photos = groups.flatMap((g) =>
    (g.keys ?? []).filter((k): k is string => !!k).map((key, i, arr) => ({
      key,
      caption: arr.length > 1 ? `${g.label} · ${i + 1} of ${arr.length}` : g.label,
    }))
  );

  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);

  const go = useCallback((delta: number) => {
    setAt((n) => (n + delta + photos.length) % photos.length);
  }, [photos.length]);

  // Arrow keys and Escape, because a dialog full of pictures that can only be
  // driven by mouse is annoying to flick through.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind scrolling while the dialog is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, go]);

  if (photos.length === 0) {
    return <span className={`text-faint text-xs ${className}`}>No pictures</span>;
  }

  const current = photos[at];

  return (
    <>
      <button
        type="button"
        onClick={() => { setAt(0); setOpen(true); }}
        className={`text-accent-purple hover:underline text-xs font-medium whitespace-nowrap ${className}`}
      >
        {label} ({photos.length})
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.caption}
          className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          {/* Header: what you are looking at, and the way out */}
          <div
            className="flex items-center justify-between gap-4 px-5 py-3 text-white/90"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{current.caption}</p>
              <p className="text-white/60 text-xs tabular-nums">{at + 1} of {photos.length}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href={fileUrl(current.key)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white text-xs underline"
              >
                Open full size
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-white/70 hover:text-white rounded-lg p-1.5 hover:bg-white/10 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* The picture, with a tap target either side */}
          <div className="flex-1 flex items-center justify-between gap-2 px-2 pb-2 min-h-0">
            {photos.length > 1 && (
              <button
                type="button"
                aria-label="Previous picture"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                className="shrink-0 text-white/70 hover:text-white rounded-full p-3 hover:bg-white/10 transition-colors"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <img
              src={fileUrl(current.key)}
              alt={current.caption}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full object-contain rounded-lg select-none"
            />
            {photos.length > 1 && (
              <button
                type="button"
                aria-label="Next picture"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                className="shrink-0 text-white/70 hover:text-white rounded-full p-3 hover:bg-white/10 transition-colors"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>

          {/* Thumbnails: jumping to the return shot without stepping through
              six handover photos is the whole point of a comparison. */}
          {photos.length > 1 && (
            <div
              className="flex gap-2 overflow-x-auto px-5 py-3"
              onClick={(e) => e.stopPropagation()}
            >
              {photos.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAt(i)}
                  aria-label={p.caption}
                  aria-current={i === at}
                  className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                    i === at ? "border-accent-teal" : "border-white/20 hover:border-white/50"
                  }`}
                >
                  <img src={fileUrl(p.key)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
