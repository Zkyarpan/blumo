import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getUser } from "@/features/auth/get-user";
import { PageContainer } from "@/components/layout/PageContainer";
import { getMissionReview } from "@/features/missions/mission-review.service";
import { MissionReview } from "@/features/missions/MissionReview";

interface ReviewPageProps {
  params: Promise<{ taskId: string }>;
}

export const metadata: Metadata = {
  title: "Mission Review — Blumo",
  description: "Review and approve your AI-generated daily mission.",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MissionReviewPage({ params }: ReviewPageProps) {
  const { taskId } = await params;

  // Validate taskId shape before any database call
  if (!UUID_RE.test(taskId)) {
    notFound();
  }

  const user = await getUser();
  if (!user) {
    notFound();
  }

  const result = await getMissionReview(user.id, taskId);

  if (result.kind === "not_found") {
    notFound();
  }

  if (result.kind === "error" || result.kind === "invalid") {
    return (
      <PageContainer width="default" className="py-10">
        <div
          role="alert"
          className="rounded-xl border p-6"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <p className="font-medium" style={{ color: "var(--state-error)" }}>
            Unable to load mission review.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Refresh the page. If the problem continues, return to the dashboard.
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="default" className="py-10">
      <MissionReview data={result.data} />
    </PageContainer>
  );
}
