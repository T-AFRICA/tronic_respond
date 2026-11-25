/** Instant skeleton for the public catalog while products stream in. */
export default function CatalogLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-14 bg-tronic-red" />
      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <div className="flex gap-2">
          <div className="h-11 flex-1 bg-white border border-neutral-border rounded" />
          <div className="h-11 w-32 bg-white border border-neutral-border rounded" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-white border border-neutral-border rounded-lg overflow-hidden"
            >
              <div className="aspect-square bg-neutral-bg" />
              <div className="p-2.5 space-y-2">
                <div className="h-3.5 bg-neutral-bg rounded w-5/6" />
                <div className="h-3 bg-neutral-bg rounded w-1/2" />
                <div className="h-4 bg-neutral-bg rounded w-2/3" />
                <div className="h-8 bg-neutral-bg rounded" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
