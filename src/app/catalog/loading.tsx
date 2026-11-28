/** Instant skeleton for the public catalog while products stream in. */
export default function CatalogLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-14 bg-tronic-red" />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <div className="bg-white border border-neutral-border rounded-2xl p-3 flex gap-2">
          <div className="h-10 flex-1 bg-neutral-bg rounded-xl" />
          <div className="h-10 w-32 bg-neutral-bg rounded-xl" />
          <div className="h-10 w-20 bg-neutral-bg rounded-xl" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-white border border-neutral-border rounded-2xl overflow-hidden shadow-sm"
            >
              <div className="aspect-square bg-neutral-bg" />
              <div className="p-3 space-y-2">
                <div className="h-3.5 bg-neutral-bg rounded w-5/6" />
                <div className="h-4 bg-neutral-bg rounded w-1/2" />
                <div className="h-9 bg-neutral-bg rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
