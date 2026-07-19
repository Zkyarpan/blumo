import { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageContainer } from "@/components/layout/PageContainer";
import { getUser } from "@/features/auth/get-user";
import { MissionReview } from "@/features/missions/MissionReview";
import { getMissionReviewModel } from "@/features/missions/mission-review.service";

export const metadata: Metadata = {
  title: "Review Mission — Blumo",
  description: "Review and approve your AI-generated mission.",
};

const taskIdSchema = z.string().uuid();

interface ReviewPageProps {
  params: Promise<{ taskId: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const { taskId: rawTaskId } = await params;

  // Validate taskId before using it as a lookup key
  const taskIdResult = taskIdSchema.safeParse(rawTaskId);
  if (!taskIdResult.success) {
    notFound();
  }

  const taskId = taskIdResult.data;
  const model = await getMissionReviewModel(user.id, taskId);

  if (!model) {
    // Same experience for missing and foreign task
    notFound();
  }

  return (
    <PageContainer width="default" className="py-8">
      <div className="mb-6">
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Mission review
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Review the AI-generated mission before approving or rejecting it.
        </p>
      </div>
      <MissionReview model={model} />
    </PageContainer>
  );
}
