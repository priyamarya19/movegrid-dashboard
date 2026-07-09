export default function LoadingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-base">
      {/* Sidebar placeholder — matches w-56 from Sidebar */}
      <div className="hidden lg:flex w-56 shrink-0 bg-surface-alt border-r border-default flex-col h-screen">
        <div className="px-4 py-5 border-b border-default">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-default rounded-lg" />
            <div className="h-4 w-20 bg-default rounded" />
          </div>
        </div>
        <div className="flex-1 px-3 py-4 space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-9 bg-default rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-surface-alt border-b border-default shrink-0">
          <div className="w-5 h-5 bg-default rounded animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-default rounded-md animate-pulse" />
            <div className="w-16 h-4 bg-default rounded animate-pulse" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 animate-pulse">
          {children}
        </main>
      </div>
    </div>
  );
}
