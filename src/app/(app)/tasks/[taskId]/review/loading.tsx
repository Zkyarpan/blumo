import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Separator } from "@/components/ui/separator";

export default function MissionReviewLoading() {
  return (
    <PageContainer width="default" className="py-10">
      <div className="space-y-6" aria-busy="true" aria-label="Loading mission review">
        {/* AI notice skeleton */}
        <div
          className="rounded-xl border p-4 space-y-2"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
        >
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Title + metadata skeleton */}
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
        >
          <div className="flex gap-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>

        {/* Checklist skeleton */}
        <div
          className="rounded-xl border p-6 space-y-3"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
        >
          <Skeleton className="h-5 w-36" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2 items-center">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>

        {/* Cards skeleton */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div
            className="rounded-xl border p-4 space-y-2"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div
            className="rounded-xl border p-4 space-y-2"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>

        <Separator />

        {/* Decision skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
