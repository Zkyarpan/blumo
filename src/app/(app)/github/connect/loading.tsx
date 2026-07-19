<<<<<<< HEAD
export default function ConnectLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div className="h-8 w-72 rounded-lg bg-muted animate-pulse" />
      <div className="h-48 w-full rounded-xl bg-muted animate-pulse" />
      <div className="h-10 w-44 rounded-lg bg-muted animate-pulse" />
      <div className="h-4 w-96 rounded bg-muted animate-pulse" />
    </div>
=======
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

export default function ConnectGitHubLoading() {
  return (
    <PageContainer width="narrow" className="py-10">
      <div className="max-w-lg mx-auto space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </PageContainer>
>>>>>>> origin/main
  );
}
