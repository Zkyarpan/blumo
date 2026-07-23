import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Separator } from "@/components/ui/separator";

export default function CommitLoading() {
  return (
    <PageContainer width="wide" className="py-10">
      <div
        className="space-y-6"
        aria-busy="true"
        aria-label="Loading commit proposal"
      >
        {/* AI notice skeleton */}
        <div
          className="rounded-xl border p-4 space-y-2"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Title skeleton */}
        <div
          className="rounded-xl border p-6 space-y-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <div className="flex gap-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-8 w-3/4" />
        </div>

        {/* Commit details skeleton */}
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <Skeleton className="h-5 w-28" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>

        {/* Content preview skeleton */}
        <div
          className="rounded-xl border"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <div className="border-b px-4 py-2" style={{ borderColor: "var(--border-default)" }}>
            <Skeleton className="h-3 w-48" />
          </div>
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-3" style={{ width: `${60 + (i % 4) * 10}%` }} />
            ))}
          </div>
        </div>

        <Separator />

        {/* Action skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-44" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
