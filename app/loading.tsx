import LoadingShell from "@/components/LoadingShell";

// Default route-loading UI for the whole dashboard. Rendered by Next while a
// page's server component (and its DB queries) resolve, so navigation shows the
// branded skeleton instead of a blank screen. LoadingShell already draws the
// sidebar/topbar placeholders; we just fill the content area with a few blocks.
export default function Loading() {
  return (
    <LoadingShell>
      <div className="space-y-4">
        <div className="h-7 w-48 bg-default rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-surface border border-default rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-surface border border-default rounded-xl" />
      </div>
    </LoadingShell>
  );
}
