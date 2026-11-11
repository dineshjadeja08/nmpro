export default function CategoryLoadingSkeleton() {
  return (
    <main className="bg-[#FBF8F5]">
      <section className="border-b border-[#EAE3DC] bg-white py-10">
        <div className="container space-y-3">
          <div className="h-4 w-32 animate-pulse rounded bg-[#EFE9E2]" />
          <div className="h-9 w-64 animate-pulse rounded bg-[#EFE9E2]" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[#EFE9E2]" />
        </div>
      </section>
      <section className="container py-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-[#EAE3DC] bg-white p-4 space-y-3"
            >
              <div className="aspect-[16/7] w-full animate-pulse rounded-md bg-[#EFE9E2]" />
              <div className="h-5 w-3/4 animate-pulse rounded bg-[#EFE9E2]" />
              <div className="h-4 w-full animate-pulse rounded bg-[#EFE9E2]" />
              <div className="h-9 w-full animate-pulse rounded-md bg-[#EFE9E2]" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
