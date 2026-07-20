import { Bot, Calendar, CheckCircle2, Clock3, GitBranch, GraduationCap, GitCommitHorizontal, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MissionDecisionControls } from "./MissionDecisionControls";
import type { MissionReviewReadModel } from "./mission-review.types";

interface MissionReviewProps {
  data: MissionReviewReadModel;
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function formatDateTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return dateString;
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "generated") {
    return (
      <Badge
        style={{
          color: "var(--accent-strong)",
          backgroundColor: "var(--accent-soft, #eff6ff)",
        }}
      >
        Awaiting review
      </Badge>
    );
  }
  if (status === "approved") {
    return (
      <Badge
        style={{
          color: "var(--state-success)",
          backgroundColor: "var(--state-success-soft)",
        }}
      >
        Approved
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge
        style={{
          color: "var(--state-error)",
          backgroundColor: "var(--state-error-soft, #fee2e2)",
        }}
      >
        Rejected
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

export function MissionReview({ data }: MissionReviewProps) {
  const { task, currentVersion } = data;

  if (!currentVersion) {
    return (
      <div
        role="alert"
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <p className="font-medium" style={{ color: "var(--state-error)" }}>
          No mission version available.
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          This task has no valid mission content. Return to the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI-generated label + disclaimer */}
      <div
        className="flex flex-col gap-2 rounded-xl border p-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--accent-soft, #dbeafe)",
        }}
        role="note"
        aria-label="AI-generated mission notice"
      >
        <div className="flex items-center gap-2">
          <Bot
            className="size-5 shrink-0"
            aria-hidden="true"
            style={{ color: "var(--accent-primary)" }}
          />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--accent-strong)" }}
          >
            AI-generated mission
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          This mission was generated from your saved learning preferences and
          repository metadata. Repository contents were not inspected.{" "}
          <strong>Approval records your decision but does not create a
          branch, file, commit, or pull request.</strong>
        </p>
      </div>

      {/* Mission title and metadata */}
      <div
        className="rounded-xl border p-6 space-y-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <Badge variant="outline">{currentVersion.difficulty}</Badge>
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Version {currentVersion.versionNumber}
              </span>
            </div>
            <h1
              className="mt-2 text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {currentVersion.title}
            </h1>
          </div>
        </div>

        <p
          className="text-sm leading-6"
          style={{ color: "var(--text-secondary)" }}
        >
          {currentVersion.description}
        </p>

        {/* Meta row */}
        <div
          className="flex flex-wrap gap-x-5 gap-y-2 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-4" aria-hidden="true" />
            {currentVersion.estimatedMinutes} minutes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <GitBranch className="size-4" aria-hidden="true" />
            {currentVersion.suggestedBranch}
          </span>
          {task.repositoryFullName && (
            <span className="inline-flex items-center gap-1.5 font-mono">
              {task.repositoryFullName}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-4" aria-hidden="true" />
            {formatDate(task.scheduledDate)}
          </span>
        </div>
      </div>

      {/* Acceptance checklist */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <h2
          className="mb-3 text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Acceptance checklist
        </h2>
        <ul className="space-y-2" aria-label="Acceptance checklist">
          {currentVersion.acceptanceChecklist.map((item, index) => (
            <li
              key={index}
              className="flex items-start gap-2 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
                style={{ color: "var(--accent-primary)" }}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Learning outcome and commit message */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className="rounded-xl border p-4"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <p
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            <GraduationCap className="size-4" aria-hidden="true" />
            Learning outcome
          </p>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            {currentVersion.learningOutcome}
          </p>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <p
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            <GitCommitHorizontal className="size-4" aria-hidden="true" />
            Suggested commit message
          </p>
          <p
            className="font-mono text-sm"
            style={{ color: "var(--text-primary)" }}
          >
            {currentVersion.suggestedCommitMessage}
          </p>
        </div>
      </div>

      {/* Generation metadata */}
      <div
        className="rounded-xl border p-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <p
          className="mb-2 text-xs font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          Generation details
        </p>
        <dl
          className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          <div className="flex gap-1">
            <dt className="font-medium" style={{ color: "var(--text-muted)" }}>
              Generated:
            </dt>
            <dd>{formatDateTime(currentVersion.createdAt)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-medium" style={{ color: "var(--text-muted)" }}>
              Provider:
            </dt>
            <dd>{currentVersion.aiProvider}</dd>
          </div>
          {currentVersion.approvedAt && (
            <div className="flex gap-1">
              <dt
                className="font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Approved:
              </dt>
              <dd>{formatDateTime(currentVersion.approvedAt)}</dd>
            </div>
          )}
          {currentVersion.rejectedAt && (
            <div className="flex gap-1">
              <dt
                className="font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Rejected:
              </dt>
              <dd>{formatDateTime(currentVersion.rejectedAt)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Repository unavailable warning (read-only) */}
      {task.repositoryAccessStatus !== "active" && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border p-4 text-sm"
          style={{
            borderColor: "var(--state-warning)",
            backgroundColor: "var(--state-warning-soft, #fef9c3)",
          }}
        >
          <AlertCircle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
            style={{ color: "var(--state-warning)" }}
          />
          <p style={{ color: "var(--text-primary)" }}>
            The repository associated with this mission is no longer available.
            Review history remains readable. Manage your repositories to restore
            access.
          </p>
        </div>
      )}

      <Separator />

      {/* Decision controls */}
      <section aria-label="Mission decision">
        <h2
          className="mb-4 text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {task.status === "generated"
            ? "Your decision"
            : task.status === "rejected"
            ? "Request a replacement"
            : task.status === "approved"
            ? "Mission approved"
            : "Mission status"}
        </h2>
        <MissionDecisionControls task={task} currentVersion={currentVersion} />
      </section>
    </div>
  );
}
