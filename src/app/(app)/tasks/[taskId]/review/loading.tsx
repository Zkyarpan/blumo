import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewLoading() {
  return (
    <PageContainer width="default" className="py-8">
      <div className="mb-6 space-y-2" aria-busy="true" aria-label="Loading mission review">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* AI notice skeleton */}
      <Skeleton className="mb-6 h-20 w-full rounded-lg" />

      {/* Mission card skeleton */}
      <Card
        className="mb-6 rounded-xl border"
        style={{ borderColor: "var(--border-default)" }}
      >
        <CardHeader className="space-y-3 pb-3">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-7 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        </CardContent>
      </Card>

      {/* Details skeleton */}
      <Card
        className="mb-6 rounded-xl border"
        style={{ borderColor: "var(--border-default)" }}
      >
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
        </CardContent>
      </Card>

      {/* Decision controls skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-36 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>
    </PageContainer>
  );
}
