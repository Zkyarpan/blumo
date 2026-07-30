import { GitCommitHorizontal } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";

export default function AutoCommitsLoading() {
  return (
    <PageContainer width="wide" className="py-10">
      <div className="mb-8">
        <div className="h-8 w-48 rounded-lg animate-pulse" style={{ backgroundColor: "var(--bg-subtle)" }} />
        <div className="mt-2 h-4 w-72 rounded animate-pulse" style={{ backgroundColor: "var(--bg-subtle)" }} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border p-5 h-24 animate-pulse" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }} />
        ))}
      </div>
      <div className="flex items-center justify-center py-20 gap-3" style={{ color: "var(--text-muted)" }}>
        <GitCommitHorizontal className="size-5 animate-pulse" aria-hidden="true" />
        <span className="text-sm">Loading auto-commits…</span>
      </div>
    </PageContainer>
  );
}
