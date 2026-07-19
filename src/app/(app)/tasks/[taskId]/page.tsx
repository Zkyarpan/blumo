import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { CheckCircle } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUser } from "@/features/auth/get-user";
import { getMissionReviewModel } from "@/features/missions/mission-review.service";

export const metadata: Metadata = {
  title: "Mission Approved — Blumo",
  description: "Your mission has been approved.",
};

const taskIdSchema = z.string().uuid();

interface TaskPageProps {
  params: Promise<{ taskId: string }>;
}

export default async function TaskPage({ params }: TaskPageProps) {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const { taskId: rawTaskId } = await params;
  const taskIdResult = taskIdSchema.safeParse(rawTaskId);
  if (!taskIdResult.success) {
    notFound();
  }

  const taskId = taskIdResult.data;
  const model = await getMissionReviewModel(user.id, taskId);

  if (!model) {
    notFound();
  }

  // If not yet approved, redirect to review
  if (model.status === "generated" || model.status === "rejected") {
    // Use Link to let them navigate — don't server-redirect as the action already handles this
  }

  return (
    <PageContainer width="narrow" className="py-8">
      <Card
        className="rounded-xl border"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle
              className="size-6"
              aria-hidden="true"
              style={{
                color:
                  model.status === "approved"
                    ? "var(--state-success)"
                    : "var(--text-muted)",
              }}
            />
            <CardTitle style={{ color: "var(--text-primary)" }}>
              {model.status === "approved"
                ? "Mission approved"
                : model.status === "in_progress"
                ? "Mission in progress"
                : model.status === "completed"
                ? "Mission completed"
                : "Mission"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p
              className="text-lg font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {model.mission.title}
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              {model.mission.description}
            </p>
          </div>

          {model.status === "approved" && (
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--border-default)" }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                No GitHub changes have been made.
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                Your decision has been recorded. The editable workspace where you
                can prepare and submit your contribution will be available in the
                next implementation step.
              </p>
            </div>
          )}

          {(model.status === "generated" || model.status === "rejected") && (
            <Link
              href={`/tasks/${taskId}/review`}
              className="inline-flex items-center text-sm font-medium underline underline-offset-4"
              style={{ color: "var(--accent-strong)" }}
            >
              Review this mission →
            </Link>
          )}

          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            ← Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
