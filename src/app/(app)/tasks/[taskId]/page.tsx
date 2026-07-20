import { notFound } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { getUser } from "@/features/auth/get-user";
import { PageContainer } from "@/components/layout/PageContainer";
import { getMissionReview } from "@/features/missions/mission-review.service";
import { Badge } from "@/components/ui/badge";

interface TaskPageProps {
  params: Promise<{ taskId: string }>;
}

export const metadata: Metadata = {
  title: "Mission — Blumo",
  description: "Your approved Blumo daily mission.",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TaskPage({ params }: TaskPageProps) {
  const { taskId } = await params;

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

  if (result.kind !== "found" || !result.data.currentVersion) {
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
            Unable to load mission.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Refresh the page or return to the dashboard.
          </p>
        </div>
      </PageContainer>
    );
  }

  const { task, currentVersion } = result.data;

  // If not approved, redirect to review page
  if (task.status !== "approved") {
    return (
      <PageContainer width="default" className="py-10">
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            This mission has not been approved yet.
          </p>
          <Link
            href={`/tasks/${taskId}/review`}
            className="inline-block text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--accent-strong)" }}
          >
            Go to mission review →
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="default" className="py-10">
      <div className="space-y-6">
        {/* Success banner */}
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border p-4"
          style={{
            borderColor: "var(--state-success-soft)",
            backgroundColor: "var(--state-success-soft)",
          }}
        >
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0"
            aria-hidden="true"
            style={{ color: "var(--state-success)" }}
          />
          <div>
            <p
              className="font-semibold"
              style={{ color: "var(--state-success)" }}
            >
              Mission approved. No GitHub changes have been made.
            </p>
            <p
              className="mt-0.5 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              The task workspace is the next step and is coming in a future
              update.
            </p>
          </div>
        </div>

        {/* Approved mission summary */}
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              style={{
                color: "var(--state-success)",
                backgroundColor: "var(--state-success-soft)",
              }}
            >
              Approved
            </Badge>
            <Badge variant="outline">{currentVersion.difficulty}</Badge>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Version {currentVersion.versionNumber} •{" "}
              {currentVersion.aiProvider}
            </span>
          </div>

          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {currentVersion.title}
          </h1>
          <p
            className="text-sm leading-6"
            style={{ color: "var(--text-secondary)" }}
          >
            {currentVersion.description}
          </p>

          <div
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {currentVersion.approvedAt && (
              <span>
                Approved{" "}
                {new Date(currentVersion.approvedAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            )}
          </div>
        </div>

        <Link
          href={`/tasks/${taskId}/review`}
          className="inline-block text-sm font-medium underline underline-offset-4"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back to mission review
        </Link>
      </div>
    </PageContainer>
  );
}
