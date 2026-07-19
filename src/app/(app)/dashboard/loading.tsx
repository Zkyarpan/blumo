import { PageContainer } from "@/components/layout/PageContainer";

export default function DashboardLoading() {
  return (
    <PageContainer width="wide" className="py-8">
      <div className="space-y-6">
        {/* Welcome header skeleton */}
        <div className="space-y-2">
          <div className="h-8 w-72 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-56 rounded bg-muted animate-pulse" />
        </div>

        {/* Top row: mission (2/3) + github (1/3) */}
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 h-48 rounded-xl bg-muted animate-pulse" />
          <div className="md:col-span-1 h-48 rounded-xl bg-muted animate-pulse" />
        </div>

        {/* Goal summary */}
        <div className="h-36 w-full rounded-xl bg-muted animate-pulse" />

        {/* Progress summary */}
        <div className="h-24 w-full rounded-xl bg-muted animate-pulse" />

        {/* Recent activity */}
        <div className="h-32 w-full rounded-xl bg-muted animate-pulse" />
      </div>
    </PageContainer>
  );
}
