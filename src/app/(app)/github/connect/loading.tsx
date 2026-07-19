import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";

export default function ConnectGitHubLoading() {
  return (
    <PageContainer width="narrow" className="py-10">
      <div className="max-w-lg mx-auto space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </PageContainer>
  );
}
