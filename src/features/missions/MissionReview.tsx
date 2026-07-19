import {
  BookOpen,
  Calendar,
  Check,
  CircleAlert,
  Clock3,
  GitBranch,
  GraduationCap,
  Layers,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MissionReviewModel } from "./mission-review.types";
import { MissionDecisionControls } from "./MissionDecisionControls";

interface MissionReviewProps {
  model: MissionReviewModel;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const STATUS_LABELS: Record<string, string> = {
  generated: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  in_progress: "In progress",
  completed: "Completed",
};

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-4">
      <dt
        className="min-w-32 text-sm font-medium sm:text-right"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </dt>
      <dd className="text-sm" style={{ color: "var(--text-primary)" }}>
        {children}
      </dd>
    </div>
  );
}

export function MissionReview({ model }: MissionReviewProps) {
  const { mission, repository } = model;

  return (
    <div className="space-y-6">
      {/* AI-generated notice */}
      <div
        className="flex items-start gap-3 rounded-lg border px-4 py-3"
        role="note"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        <Sparkles
          className="mt-0.5 size-5 shrink-0"
          aria-hidden="true"
          style={{ color: "var(--accent-primary)" }}
        />
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            AI-generated mission
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            This mission was generated from your saved preferences and repository
            metadata. Repository contents were not inspected.
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong>Approving this mission does not create a branch, file, commit, or
            pull request.</strong> It only records your decision.
          </p>
        </div>
      </div>

      {/* Mission header */}
      <Card
        className="rounded-xl border"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              style={{
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              {STATUS_LABELS[model.status] ?? model.status}
            </Badge>
            <Badge variant="outline">{DIFFICULTY_LABELS[mission.difficulty] ?? mission.difficulty}</Badge>
            {model.reviewOperationStatus === "regenerating" && (
              <Badge
                style={{
                  color: "var(--accent-primary)",
                  backgroundColor: "var(--accent-soft)",
                }}
              >
                Regenerating…
              </Badge>
            )}
          </div>
          <CardTitle
            className="mt-2 text-xl font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {mission.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Description */}
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {mission.description}
          </p>

          {/* Meta row */}
          <div
            className="flex flex-wrap gap-x-5 gap-y-2 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" aria-hidden="true" />
              {mission.estimated_minutes} minutes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-4" aria-hidden="true" />
              {mission.suggested_branch}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-4" aria-hidden="true" />
              {formatDate(model.scheduledDate)}
            </span>
            {repository && (
              <span className="inline-flex items-center gap-1.5">
                <Layers className="size-4" aria-hidden="true" />
                {repository.fullName}
              </span>
            )}
          </div>

          {/* Repository unavailable note */}
          {repository && !repository.isAvailable && (
            <div
              className="flex items-start gap-2 rounded-lg border p-3"
              role="note"
              style={{
                borderColor: "var(--state-warning)",
                backgroundColor: "var(--state-warning-soft)",
              }}
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
                style={{ color: "var(--state-warning)" }}
              />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Repository access is currently unavailable. The mission content remains readable.
              </p>
            </div>
          )}

          {/* Acceptance checklist */}
          <section aria-labelledby="checklist-heading">
            <h2
              id="checklist-heading"
              className="mb-2 flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              <Check className="size-4" aria-hidden="true" />
              Acceptance checklist
            </h2>
            <ul className="space-y-2" aria-label="Acceptance checklist items">
              {mission.acceptance_checklist.map((item, index) => (
                <li
                  key={index}
                  className="flex gap-2 text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <span
                    className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-xs"
                    style={{
                      backgroundColor: "var(--border-default)",
                      color: "var(--text-muted)",
                    }}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Commit message + Learning outcome */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--border-default)" }}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <MessageSquare
                  className="size-4"
                  aria-hidden="true"
                  style={{ color: "var(--text-muted)" }}
                />
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Suggested commit message
                </p>
              </div>
              <p
                className="font-mono text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {mission.suggested_commit_message}
              </p>
            </div>
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--border-default)" }}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <GraduationCap
                  className="size-4"
                  aria-hidden="true"
                  style={{ color: "var(--text-muted)" }}
                />
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Learning outcome
                </p>
              </div>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {mission.learning_outcome}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Version info */}
      <Card
        className="rounded-xl border"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <BookOpen size={16} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <CardTitle className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              Mission details
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            <InfoRow label="Version">
              Version {model.currentVersionNumber}
            </InfoRow>
            <InfoRow label="Generated">
              {formatDate(model.versionCreatedAt)}
            </InfoRow>
            {model.rejectedAt && (
              <InfoRow label="Rejected">
                {new Date(model.rejectedAt).toLocaleString()}
              </InfoRow>
            )}
            {model.rejectionReason && model.status === "rejected" && (
              <InfoRow label="Reason">
                {model.rejectionReason}
              </InfoRow>
            )}
            {model.approvedAt && (
              <InfoRow label="Approved">
                {new Date(model.approvedAt).toLocaleString()}
              </InfoRow>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Decision controls */}
      <section aria-labelledby="decision-heading">
        <h2
          id="decision-heading"
          className="mb-3 text-base font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Review decision
        </h2>
        <MissionDecisionControls
          taskId={model.taskId}
          expectedVersionNumber={model.currentVersionNumber}
          currentStatus={model.status}
          reviewOperationStatus={model.reviewOperationStatus}
          regenerationCount={model.regenerationCount}
          repositoryIsAvailable={repository?.isAvailable ?? false}
          approvedAt={model.approvedAt}
        />
      </section>
    </div>
  );
}
