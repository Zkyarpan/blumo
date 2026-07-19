"use client";

import { useActionState, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  approveMissionAction,
  rejectMissionAction,
  regenerateMissionAction,
} from "./mission-review.actions";
import type {
  ApproveActionState,
  RejectActionState,
  RegenerateActionState,
} from "./mission-review.types";

interface MissionDecisionControlsProps {
  taskId: string;
  expectedVersionNumber: number;
  currentStatus: "generated" | "approved" | "rejected" | "in_progress" | "completed";
  reviewOperationStatus: "idle" | "regenerating";
  regenerationCount: number;
  repositoryIsAvailable: boolean;
  approvedAt: string | null;
}

function errorMessage(code: string): string {
  switch (code) {
    case "repository_unavailable":
      return "Repository access is not available. Restore access before approving.";
    case "stale_version":
      return "This mission changed in another tab. The page will refresh.";
    case "invalid_transition":
      return "This mission is no longer in a state that allows this action. Refresh to see the current state.";
    case "already_approved":
      return "Mission is already approved.";
    case "already_rejected":
      return "Mission is already rejected.";
    case "usage_limit_reached":
      return "No more replacements are available for this mission or time window.";
    case "unauthorized":
      return "You are not authorized to perform this action.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function MissionDecisionControls({
  taskId,
  expectedVersionNumber,
  currentStatus,
  reviewOperationStatus,
  regenerationCount,
  repositoryIsAvailable,
  approvedAt,
}: MissionDecisionControlsProps) {
  const [approveState, approveAction, approvalPending] = useActionState<ApproveActionState, FormData>(
    approveMissionAction,
    null
  );
  const [rejectState, rejectAction, rejectionPending] = useActionState<RejectActionState, FormData>(
    rejectMissionAction,
    null
  );
  const [regenState, regenAction, regenPending] = useActionState<RegenerateActionState, FormData>(
    regenerateMissionAction,
    null
  );

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showRegenForm, setShowRegenForm] = useState(false);
  const [reasonInput, setReasonInput] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const rejectFormRef = useRef<HTMLFormElement>(null);
  const regenFormRef = useRef<HTMLFormElement>(null);

  // When stale_version error: page needs refresh
  const isStale =
    (!approveState?.ok && approveState?.code === "stale_version") ||
    (!rejectState?.ok && rejectState?.code === "stale_version") ||
    (!regenState?.ok && regenState?.code === "stale_version");

  // Any action is pending
  const anyPending = approvalPending || rejectionPending || regenPending;
  const isRegenerating = reviewOperationStatus === "regenerating" || regenPending;

  // After successful rejection, show regen form option
  const justRejected = rejectState?.ok && rejectState.code === "rejected";

  // After successful regen claim, show info
  const regenClaimed = regenState?.ok;

  const canApprove =
    currentStatus === "generated" &&
    reviewOperationStatus === "idle" &&
    repositoryIsAvailable &&
    !anyPending;

  const canReject =
    currentStatus === "generated" &&
    reviewOperationStatus === "idle" &&
    !anyPending;

  const canRegenerate =
    (currentStatus === "rejected" || justRejected) &&
    reviewOperationStatus === "idle" &&
    !isRegenerating &&
    repositoryIsAvailable &&
    regenerationCount < 2 &&
    !anyPending;

  const limitReached =
    currentStatus === "rejected" && regenerationCount >= 2;

  if (currentStatus === "approved") {
    return (
      <div
        className="rounded-lg border p-4"
        role="status"
        style={{ borderColor: "var(--state-success)", backgroundColor: "var(--state-success-soft)" }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle
            className="size-5 shrink-0"
            aria-hidden="true"
            style={{ color: "var(--state-success)" }}
          />
          <p className="font-medium" style={{ color: "var(--text-primary)" }}>
            Mission approved. No GitHub changes have been made.
          </p>
        </div>
        {approvedAt && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Approved at {new Date(approvedAt).toLocaleString()}
          </p>
        )}
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          The editable workspace will be available in the next step.
        </p>
      </div>
    );
  }

  if (currentStatus === "in_progress" || currentStatus === "completed") {
    return (
      <div
        className="rounded-lg border p-4"
        role="status"
        style={{ borderColor: "var(--border-default)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {currentStatus === "completed"
            ? "This mission is complete."
            : "This mission is in progress."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stale state alert */}
      {isStale && (
        <div
          className="rounded-lg border p-3"
          role="alert"
          style={{ borderColor: "var(--state-warning)", backgroundColor: "var(--state-warning-soft)" }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            The mission changed in another tab.
          </p>
          <button
            type="button"
            className="mt-1 text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--accent-strong)" }}
            onClick={() => window.location.reload()}
          >
            Reload to see the latest state
          </button>
        </div>
      )}

      {/* Repository unavailable */}
      {!repositoryIsAvailable && (currentStatus === "generated" || currentStatus === "rejected") && (
        <div
          className="rounded-lg border p-3"
          role="alert"
          style={{ borderColor: "var(--state-error)", backgroundColor: "var(--state-error-soft)" }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" style={{ color: "var(--state-error)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Repository access is unavailable.
              </p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
                Approval and regeneration require an active repository. The mission history remains readable.{" "}
                <a
                  href="/github/repositories"
                  className="underline underline-offset-4"
                  style={{ color: "var(--accent-strong)" }}
                >
                  Manage repositories
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Usage limit reached */}
      {limitReached && (
        <div
          className="rounded-lg border p-3"
          role="status"
          style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No more replacements are available for this mission. All versions remain readable.
          </p>
        </div>
      )}

      {/* Regenerating status */}
      {isRegenerating && (
        <div
          className="flex items-center gap-2 rounded-lg border p-3"
          role="status"
          aria-live="polite"
          style={{ borderColor: "var(--border-default)" }}
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" style={{ color: "var(--accent-primary)" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Creating a replacement mission…
          </p>
        </div>
      )}

      {/* After regen claimed */}
      {regenClaimed && !regenPending && (
        <div
          className="rounded-lg border p-3"
          role="status"
          aria-live="polite"
          style={{ borderColor: "var(--border-default)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Replacement mission requested. Refresh the page to see the new mission once it is ready.
          </p>
        </div>
      )}

      {/* Generated: approve + reject buttons */}
      {currentStatus === "generated" && !isRegenerating && (
        <div
          className="flex flex-wrap gap-3"
          aria-busy={anyPending}
        >
          {/* Approve form */}
          <form action={approveAction}>
            <input type="hidden" name="taskId" value={taskId} />
            <input
              type="hidden"
              name="expectedVersionNumber"
              value={expectedVersionNumber}
            />
            <Button
              type="submit"
              disabled={!canApprove}
              aria-disabled={!canApprove}
              style={
                canApprove
                  ? { backgroundColor: "var(--state-success)", color: "#fff" }
                  : {}
              }
            >
              {approvalPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Approving mission…
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 size-4" aria-hidden="true" />
                  Approve mission
                </>
              )}
            </Button>
          </form>

          {/* Reject trigger */}
          {!showRejectForm && !rejectionPending && (
            <Button
              type="button"
              variant="outline"
              disabled={!canReject}
              aria-disabled={!canReject}
              onClick={() => setShowRejectForm(true)}
            >
              <XCircle className="mr-2 size-4" aria-hidden="true" />
              Reject mission
            </Button>
          )}
        </div>
      )}

      {/* Approve error */}
      {!approveState?.ok && approveState?.code && !isStale && approveState.code !== "stale_version" && (
        <p className="text-sm" role="alert" style={{ color: "var(--state-error)" }}>
          {errorMessage(approveState.code)}
        </p>
      )}

      {/* Rejection form */}
      {(showRejectForm || rejectionPending) && currentStatus === "generated" && (
        <form
          ref={rejectFormRef}
          action={rejectAction}
          className="space-y-3 rounded-lg border p-4"
          style={{ borderColor: "var(--border-default)" }}
        >
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="expectedVersionNumber" value={expectedVersionNumber} />
          <div>
            <label
              htmlFor="reject-reason"
              className="block text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Rejection reason{" "}
              <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                (optional)
              </span>
            </label>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Plain text, up to 500 characters.
            </p>
            <textarea
              id="reject-reason"
              name="reason"
              rows={3}
              maxLength={500}
              className="mt-2 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-default)",
              }}
              placeholder="Describe why you are rejecting this mission (optional)"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              disabled={rejectionPending}
              aria-describedby={
                !rejectState?.ok && rejectState?.fieldError
                  ? "reject-reason-error"
                  : undefined
              }
            />
            {!rejectState?.ok && rejectState?.fieldError && (
              <p
                id="reject-reason-error"
                className="mt-1 text-sm"
                role="alert"
                style={{ color: "var(--state-error)" }}
              >
                {rejectState.fieldError}
              </p>
            )}
            {!rejectState?.ok && rejectState?.code && !rejectState?.fieldError && rejectState.code !== "stale_version" && (
              <p className="mt-1 text-sm" role="alert" style={{ color: "var(--state-error)" }}>
                {errorMessage(rejectState.code)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="destructive"
              disabled={!canReject}
              aria-disabled={!canReject}
            >
              {rejectionPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Rejecting mission…
                </>
              ) : (
                "Confirm rejection"
              )}
            </Button>
            {!rejectionPending && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowRejectForm(false);
                  setReasonInput("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      {/* Rejected state: show regen option */}
      {(currentStatus === "rejected" || justRejected) && !isRegenerating && !regenClaimed && (
        <div className="space-y-3">
          <div
            className="rounded-lg border p-3"
            role="status"
            style={{ borderColor: "var(--border-default)" }}
          >
            <div className="flex items-start gap-2">
              <XCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
                style={{ color: "var(--state-error)" }}
              />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  This version was rejected and cannot be approved.
                </p>
                {currentStatus === "rejected" && !justRejected && (
                  <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
                    {canRegenerate
                      ? "Request a replacement mission below."
                      : limitReached
                      ? "No more replacements are available for this mission."
                      : "Repository access must be restored before requesting a replacement."}
                  </p>
                )}
              </div>
            </div>
          </div>

          {canRegenerate && !showRegenForm && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRegenForm(true)}
            >
              <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              Request a new mission
            </Button>
          )}
        </div>
      )}

      {/* Regeneration form */}
      {showRegenForm && canRegenerate && !isRegenerating && !regenClaimed && (
        <form
          ref={regenFormRef}
          action={regenAction}
          className="space-y-3 rounded-lg border p-4"
          style={{ borderColor: "var(--border-default)" }}
        >
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="expectedVersionNumber" value={expectedVersionNumber} />
          <div>
            <label
              htmlFor="regen-feedback"
              className="block text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              What would you like in the replacement?
              <span className="ml-1 text-xs font-normal" style={{ color: "var(--state-error)" }}>
                Required
              </span>
            </label>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Describe what to improve or focus on. 10–500 characters. Plain text only.
            </p>
            <textarea
              id="regen-feedback"
              name="feedback"
              rows={3}
              maxLength={500}
              required
              className="mt-2 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-default)",
              }}
              placeholder="e.g., make the task more focused on testing, or explore a different concept"
              value={feedbackInput}
              onChange={(e) => setFeedbackInput(e.target.value)}
              disabled={regenPending}
              aria-required="true"
              aria-describedby={
                !regenState?.ok && regenState?.fieldError
                  ? "regen-feedback-error"
                  : "regen-feedback-hint"
              }
            />
            {!regenState?.ok && regenState?.fieldError && (
              <p
                id="regen-feedback-error"
                className="mt-1 text-sm"
                role="alert"
                style={{ color: "var(--state-error)" }}
              >
                {regenState.fieldError}
              </p>
            )}
            {!regenState?.ok && regenState?.code && !regenState?.fieldError && (
              <p className="mt-1 text-sm" role="alert" style={{ color: "var(--state-error)" }}>
                {errorMessage(regenState.code)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={regenPending || feedbackInput.trim().length < 10}
              aria-disabled={regenPending || feedbackInput.trim().length < 10}
            >
              {regenPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Requesting replacement…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 size-4" aria-hidden="true" />
                  Request replacement
                </>
              )}
            </Button>
            {!regenPending && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowRegenForm(false);
                  setFeedbackInput("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
