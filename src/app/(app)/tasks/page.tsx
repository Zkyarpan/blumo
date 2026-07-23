import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Zap,
  CheckCircle2,
  Clock,

  AlertCircle,
  GitCommitHorizontal,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";
import { getUser } from "@/features/auth/get-user";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/badge";
import { getTasksPageData, type TaskSummary } from "@/features/tasks/tasks.service";

export const metadata: Metadata = {
  title: "Tasks — Blumo",
  description: "Your Blumo daily missions.",
};

// --------------------------------------------------------------------------
// Status helpers
// --------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  generating: "Generating…",
  generated: "Ready to review",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  rejected: "Rejected",
  failed: "Failed",
  archived: "Archived",
};

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<
    string,
    { color: string; bg: string }
  > = {
    generating: {
      color: "var(--state-info)",
      bg: "var(--state-info-soft)",
    },
    generated: {
      color: "var(--state-info)",
      bg: "var(--state-info-soft)",
    },
    approved: {
      color: "var(--state-success)",
      bg: "var(--state-success-soft)",
    },
    in_progress: {
      color: "var(--state-info)",
      bg: "var(--state-info-soft)",
    },
    completed: {
      color: "var(--state-success)",
      bg: "var(--state-success-soft)",
    },
    rejected: {
      color: "var(--state-warning)",
      bg: "var(--state-warning-soft)",
    },
    failed: {
      color: "var(--state-error)",
      bg: "var(--state-error-soft)",
    },
  };

  const style = colorMap[status] ?? {
    color: "var(--text-muted)",
    bg: "var(--bg-subtle)",
  };

  return (
    <Badge
      className="text-xs font-medium"
      style={{ color: style.color, backgroundColor: style.bg, border: "none" }}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// --------------------------------------------------------------------------
// Task card action
// --------------------------------------------------------------------------

function TaskAction({ task }: { task: TaskSummary }) {
  switch (task.status) {
    case "generated":
      return (
        <Link
          href={`/tasks/${task.id}/review`}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "#fff",
          }}
        >
          Review mission
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      );
    case "approved":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/tasks/${task.id}/commit`}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: "var(--accent-primary)",
              color: "#fff",
            }}
          >
            <GitCommitHorizontal className="size-4" aria-hidden="true" />
            Continue to commit
          </Link>
          <Link
            href={`/tasks/${task.id}/review`}
            className="text-sm underline underline-offset-4 cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            View review
          </Link>
        </div>
      );
    case "in_progress":
      return (
        <Link
          href={`/tasks/${task.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "#fff",
          }}
        >
          Continue mission
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      );
    case "completed":
      return (
        <Link
          href={`/tasks/${task.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          View result
        </Link>
      );
    case "rejected":
      return (
        <Link
          href={`/tasks/${task.id}/review`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          View rejected mission
        </Link>
      );
    case "failed":
      return (
        <Link
          href={`/tasks/${task.id}/review`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          <AlertCircle className="size-4" aria-hidden="true" />
          View details
        </Link>
      );
    default:
      return null;
  }
}

// --------------------------------------------------------------------------
// Task card
// --------------------------------------------------------------------------

function TaskCard({ task, featured = false }: { task: TaskSummary; featured?: boolean }) {
  return (
    <article
      className="rounded-xl border p-5 space-y-4"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: featured ? "var(--accent-primary)" : "var(--border-default)",
        borderWidth: featured ? "1.5px" : undefined,
      }}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={task.status} />
        {task.difficulty && (
          <Badge
            variant="outline"
            className="text-xs"
            style={{
              color: "var(--text-muted)",
              borderColor: "var(--border-default)",
            }}
          >
            {task.difficulty}
          </Badge>
        )}
        {task.currentVersionNumber && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            v{task.currentVersionNumber}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className="text-base font-semibold leading-snug"
        style={{ color: "var(--text-primary)" }}
      >
        {task.title}
      </h3>

      {/* Meta */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        {task.estimatedMinutes && (
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            {task.estimatedMinutes} min
          </span>
        )}
        {task.repositoryFullName && (
          <span className="font-mono truncate max-w-xs">
            {task.repositoryFullName}
          </span>
        )}
        <span>{formatDate(task.scheduledDate)}</span>
        {task.completedAt && (
          <span className="flex items-center gap-1">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Completed {formatDate(task.completedAt)}
          </span>
        )}
      </div>

      {/* Action */}
      <TaskAction task={task} />
    </article>
  );
}

// --------------------------------------------------------------------------
// Empty state
// --------------------------------------------------------------------------

function TasksEmptyState() {
  return (
    <div
      className="rounded-xl border p-10 text-center"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <Zap
        className="mx-auto size-10 mb-4"
        aria-hidden="true"
        style={{ color: "var(--border-strong)" }}
      />
      <h2
        className="text-base font-semibold mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        No missions yet
      </h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Generate your first mission from the dashboard to start growing every
        day.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
        style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
      >
        <LayoutDashboard className="size-4" aria-hidden="true" />
        Go to dashboard
      </Link>
    </div>
  );
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default async function TasksPage() {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const data = await getTasksPageData(user.id);

  if (!data) {
    // Return soft error instead of crashing
    return (
      <PageContainer width="wide" className="py-10">
        <div
          role="alert"
          className="rounded-xl border p-6"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <p className="font-medium" style={{ color: "var(--state-error)" }}>
            Unable to load tasks.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Refresh the page or{" "}
            <Link
              href="/dashboard"
              className="underline underline-offset-4"
              style={{ color: "var(--accent-primary)" }}
            >
              return to the dashboard
            </Link>
            .
          </p>
        </div>
      </PageContainer>
    );
  }

  const { tasks, hasAnyTask } = data;

  // Group tasks
  const activeTasks = tasks.filter((t) =>
    ["generating", "generated", "approved", "in_progress"].includes(t.status)
  );
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const rejectedTasks = tasks.filter((t) => t.status === "rejected");
  const failedTasks = tasks.filter((t) => t.status === "failed");

  return (
    <PageContainer width="wide" className="py-10">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="text-2xl font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Tasks
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Your daily missions — review, approve, and commit your progress.
        </p>
      </div>

      {!hasAnyTask ? (
        <TasksEmptyState />
      ) : (
        <div className="space-y-10">
          {/* Active missions */}
          {activeTasks.length > 0 && (
            <section aria-label="Active missions">
              <h2
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Active
              </h2>
              <div className="space-y-4">
                {activeTasks.map((task) => (
                  <TaskCard key={task.id} task={task} featured />
                ))}
              </div>
            </section>
          )}

          {/* Completed missions */}
          {completedTasks.length > 0 && (
            <section aria-label="Completed missions">
              <h2
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Completed ({completedTasks.length})
              </h2>
              <div className="space-y-3">
                {completedTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </section>
          )}

          {/* Rejected missions */}
          {rejectedTasks.length > 0 && (
            <section aria-label="Rejected missions">
              <h2
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Rejected ({rejectedTasks.length})
              </h2>
              <div className="space-y-3">
                {rejectedTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </section>
          )}

          {/* Failed missions */}
          {failedTasks.length > 0 && (
            <section aria-label="Failed missions">
              <h2
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Failed ({failedTasks.length})
              </h2>
              <div className="space-y-3">
                {failedTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </section>
          )}

          {/* No active, suggest generating */}
          {activeTasks.length === 0 && (
            <div
              className="rounded-xl border p-6 text-center"
              style={{
                backgroundColor: "var(--bg-subtle)",
                borderColor: "var(--border-default)",
              }}
            >
              <p
                className="text-sm font-medium mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                No active mission. Ready for today&apos;s challenge?
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
                style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
              >
                Generate today&apos;s mission
              </Link>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
