"use client";

import { useActionState, useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  approveMissionAction,
  rejectMissionAction,
  regenerateMissionAction,
  type ApproveActionState,
  type RejectActionState,
  type RegenerateActionState,
} from "./mission-review.actions";
import type { MissionVersion } from "./mission-review.types";

// The task status can also include transient DB values not in the review flow
type TaskForControls = {
  id: string;
  status: string;
  reviewOperationStatus: string;
  regenerationCount: number;
  currentMissionVersionId: string | null;
  repositoryFullName: string | null;
  repositoryAccessStatus: string | null;
  installationStatus: string | null;
};

interface MissionDecisionControlsProps {
  task: TaskForControls;
  currentVersion: MissionVersion;
}

// ---------------------------------------------------------------------------
// Approval controls (shown when status = generated)
// ---------------------------------------------------------------------------

function ApproveControls({
  taskId,
  versionId,
}: {
  taskId: string;
  versionId: string;
}) {
  const [state, dispatch, isPending] = useActionState<ApproveActionState, FormData>(
    approveMissionAction,
    null
  );

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectState, rejectDispatch, isRejectPending] = useActionState<
    RejectActionState,
    FormData
  >(rejectMissionAction, null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const isApproving = isPending;
  const isRejecting = isRejectPending;
  const isBusy = isApproving || isRejecting;

  return (
    <div aria-busy={isBusy || undefined}>
      {/* Approve error */}
      {state && !state.ok && (
        <div
          role="alert"
          className="mb-4 rounded-md border p-3 text-sm"
          style={{
            borderColor: "var(--state-error-soft)",
            color: "var(--state-error)",
            backgroundColor: "var(--state-error-soft)",
          }}
        >
          {state.error.message}
        </div>
      )}

      {/* Approve form */}
      {!showRejectForm && (
        <form action={dispatch} className="space-y-3">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="versionId" value={versionId} />
          <Button
            type="submit"
            disabled={isBusy}
            className="w-full sm:w-auto"
            aria-label="Approve this mission"
          >
            {isApproving ? "Approving mission…" : "Approve mission"}
          </Button>
        </form>
      )}

      {/* Reject section */}
      {!showRejectForm && (
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() => setShowRejectForm(true)}
            className="w-full sm:w-auto"
            style={{ color: "var(--state-error)" }}
          >
            Reject mission
          </Button>
        </div>
      )}

      {showRejectForm && (
        <form action={rejectDispatch} className="mt-4 space-y-3">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="versionId" value={versionId} />

          {rejectState && !rejectState.ok && (
            <div
              role="alert"
              className="rounded-md border p-3 text-sm"
              style={{
                borderColor: "var(--state-error-soft)",
                color: "var(--state-error)",
                backgroundColor: "var(--state-error-soft)",
              }}
            >
              {rejectState.error.message}
              {rejectState.error.fieldErrors?.reason && (
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {rejectState.error.fieldErrors.reason.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="rejection-reason" className="text-sm font-medium">
              Reason for rejection{" "}
              <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                (optional, plain text, max 500 characters)
              </span>
            </Label>
            <Textarea
              id="rejection-reason"
              name="reason"
              ref={reasonRef}
              rows={3}
              maxLength={500}
              placeholder="Describe what you would like changed…"
              disabled={isRejecting}
              className="mt-1"
              aria-describedby="rejection-reason-hint"
            />
            <p
              id="rejection-reason-hint"
              className="mt-1 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              This is stored privately and not sent to AI until you request a
              replacement.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="outline"
              disabled={isRejecting}
              style={{ color: "var(--state-error)" }}
            >
              {isRejecting ? "Rejecting mission…" : "Confirm rejection"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isRejecting}
              onClick={() => setShowRejectForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regeneration controls (shown when status = rejected and limits allow)
// ---------------------------------------------------------------------------

function RegenerateControls({
  taskId,
  sourceVersionId,
  regenerationCount,
}: {
  taskId: string;
  sourceVersionId: string;
  regenerationCount: number;
}) {
  const [state, dispatch, isPending] = useActionState<
    RegenerateActionState,
    FormData
  >(regenerateMissionAction, null);

  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const limitReached = regenerationCount >= 2;

  if (limitReached) {
    return (
      <div
        role="status"
        className="rounded-md border p-4 text-sm"
        style={{
          borderColor: "var(--border-default)",
          color: "var(--text-muted)",
        }}
      >
        No more replacements are available for this mission. The task window for
        this date has been exhausted.
      </div>
    );
  }

  const successResult = state?.ok ? state.data.code : null;
  if (successResult === "claimed") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border p-4 text-sm"
        style={{
          borderColor: "var(--state-success-soft)",
          backgroundColor: "var(--state-success-soft)",
          color: "var(--state-success)",
        }}
      >
        Replacement mission requested. Refresh the page in a moment to see the
        updated mission.
      </div>
    );
  }

  return (
    <form action={dispatch} className="space-y-4" aria-busy={isPending || undefined}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="sourceVersionId" value={sourceVersionId} />

      {state && !state.ok && (
        <div
          role="alert"
          className="rounded-md border p-3 text-sm"
          style={{
            borderColor: "var(--state-error-soft)",
            color: "var(--state-error)",
            backgroundColor: "var(--state-error-soft)",
          }}
        >
          {state.error.message}
          {state.error.fieldErrors?.feedback && (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {state.error.fieldErrors.feedback.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="regeneration-feedback" className="text-sm font-medium">
          What should be different?{" "}
          <span style={{ color: "var(--state-error)" }} aria-hidden="true">
            *
          </span>
        </Label>
        <p
          id="feedback-desc"
          className="mt-0.5 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Required. Plain text, 10–500 characters. Describe what you would like
          changed without naming files, paths, or commands.
        </p>
        <Textarea
          id="regeneration-feedback"
          name="feedback"
          ref={feedbackRef}
          rows={3}
          minLength={10}
          maxLength={500}
          required
          disabled={isPending}
          className="mt-1"
          aria-describedby="feedback-desc"
          aria-required="true"
          placeholder="e.g. I'd like a mission that focuses more on writing tests rather than implementation."
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full sm:w-auto"
      >
        {isPending ? "Creating a replacement mission…" : "Request a new mission"}
      </Button>

      {isPending && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Creating a replacement mission…
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MissionDecisionControls({
  task,
  currentVersion,
}: MissionDecisionControlsProps) {
  if (task.status === "generating") {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Mission generation is in progress. Refresh to check.
      </p>
    );
  }

  if (task.status === "failed") {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Mission generation failed. Return to the dashboard to retry.
      </p>
    );
  }

  // Repository unavailable — block mutations
  const repoUnavailable =
    task.repositoryAccessStatus !== "active" ||
    task.installationStatus !== "active";

  if (
    repoUnavailable &&
    (task.status === "generated" ||
      (task.status === "rejected" && task.regenerationCount < 2))
  ) {
    return (
      <div
        role="alert"
        className="rounded-md border p-4 text-sm space-y-2"
        style={{
          borderColor: "var(--state-warning)",
          backgroundColor: "var(--state-warning-soft, #fef9c3)",
          color: "var(--text-primary)",
        }}
      >
        <p className="font-medium">Repository access unavailable</p>
        <p style={{ color: "var(--text-secondary)" }}>
          Your selected repository or GitHub App installation is no longer
          active. Review history remains readable, but approval and regeneration
          are disabled until access is restored.
        </p>
        <Link
          href="/github/repositories"
          className="inline-block text-sm font-medium underline underline-offset-4"
          style={{ color: "var(--accent-strong)" }}
        >
          Manage repositories →
        </Link>
      </div>
    );
  }

  // Regenerating in progress
  if (task.reviewOperationStatus === "regenerating") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border p-4 text-sm"
        style={{
          borderColor: "var(--border-default)",
          color: "var(--text-muted)",
        }}
      >
        Creating a replacement mission… Refresh in a moment to see the result.
      </div>
    );
  }

  if (task.status === "generated") {
    return (
      <ApproveControls taskId={task.id} versionId={currentVersion.id} />
    );
  }

  if (task.status === "rejected") {
    return (
      <div className="space-y-4">
        <div
          className="rounded-md border p-3 text-sm"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          This version was rejected and cannot be approved. You may request a
          replacement mission below.
        </div>
        <RegenerateControls
          taskId={task.id}
          sourceVersionId={currentVersion.id}
          regenerationCount={task.regenerationCount}
        />
      </div>
    );
  }

  if (task.status === "approved") {
    return (
      <div
        role="status"
        className="rounded-md border p-4 text-sm space-y-2"
        style={{
          borderColor: "var(--state-success-soft)",
          backgroundColor: "var(--state-success-soft)",
          color: "var(--state-success)",
        }}
      >
        <p className="font-semibold">Mission approved</p>
        <p style={{ color: "var(--text-secondary)" }}>
          No GitHub changes have been made. The task workspace is the next step
          (coming soon).
        </p>
        <Link
          href={`/tasks/${task.id}`}
          className="inline-block text-sm font-medium underline underline-offset-4"
          style={{ color: "var(--accent-strong)" }}
        >
          View approved mission →
        </Link>
      </div>
    );
  }

  if (task.status === "in_progress" || task.status === "completed") {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        This mission is in a later workflow stage and cannot be reviewed here.
      </p>
    );
  }

  return null;
}
