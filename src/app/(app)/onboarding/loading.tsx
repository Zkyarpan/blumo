export default function OnboardingLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Title skeleton */}
      <div className="h-7 w-64 rounded-md bg-muted animate-pulse mb-2" />
      <div className="h-1 w-full rounded-full bg-muted animate-pulse mb-8" />

      {/* Field skeletons */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mb-6 space-y-2">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="h-3 w-48 rounded bg-muted animate-pulse" />
          <div className="h-8 w-full rounded-lg bg-muted animate-pulse" />
        </div>
      ))}

      {/* Button skeleton */}
      <div className="h-9 w-36 rounded-lg bg-muted animate-pulse mt-4" />
    </div>
  );
}
