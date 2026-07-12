// Escape a value for safe interpolation into HTML email bodies. Rider names and
// other DB text are attacker-influenceable (a rider named `<img src=x onerror=…>`
// would otherwise execute in an ops inbox). Use for every dynamic value placed
// into report HTML.
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
