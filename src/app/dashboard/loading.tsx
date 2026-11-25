/**
 * Instant navigation feedback: the sidebar/topbar stay mounted while the
 * page streams in; this skeleton fills the content area immediately.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-5 max-w-6xl animate-pulse">
      {/* Title */}
      <div className="space-y-2">
        <div className="h-7 w-56 bg-neutral-bg rounded-lg" />
        <div className="h-4 w-80 bg-neutral-bg rounded-lg" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-white border border-neutral-border rounded-xl p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-neutral-bg shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-16 bg-neutral-bg rounded" />
              <div className="h-3 w-24 bg-neutral-bg rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="border border-neutral-border rounded-xl overflow-hidden bg-white">
        <div className="h-10 bg-neutral-bg/60 border-b border-neutral-border" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-12 border-b border-neutral-border last:border-0 px-4 flex items-center gap-4"
          >
            <div className="w-10 h-8 bg-neutral-bg rounded" />
            <div className="h-3.5 bg-neutral-bg rounded flex-1 max-w-sm" />
            <div className="h-3.5 w-20 bg-neutral-bg rounded hidden sm:block" />
            <div className="h-5 w-16 bg-neutral-bg rounded-full hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
