import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";

export default function RepositoriesLoading() {
  return (
    <PageContainer width="default" className="py-10">
      <div className="space-y-6" aria-label="Loading repositories">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </PageContainer>
  );
}
