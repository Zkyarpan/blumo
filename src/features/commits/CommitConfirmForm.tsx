"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  GitCommitHorizontal,
  GitBranch,
  FileText,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  confirmCommitAction,
  type CommitActionState,
} from "./commit.actions";
import type { CommitProposalData } from "./commit.types";

interface CommitConfirmFormProps {
  proposal: CommitProposalData;
}

// --------------------------------------------------------------------------
// Progress label during submit
// --------------------------------------------------------------------------

function ProgressLabel({ isPending }: { isPending: boolean }) {
  if (!isPending) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm"
      style={{ color: "var(--text-muted)" }}
    >
      <Loader2
        className="size-4 animate-spin"
        aria-hidden="true"
      />
      Creating commit… Do not close or refresh this page.
    </p>
  );
}

// --------------------------------------------------------------------------
// Success state
// --------------------------------------------------------------------------

function CommitSuccessState({
  proposal,
  commitUrl,
  commitSha,
  branch,
  filePath,
  repositoryFullName,
}: {
  proposal: CommitProposalData;
  commitUrl?: string;
  commitSha?: string;
  branch?: string;
  filePath?: string;
  repositoryFullName?: string;
}) {
  const displayBranch = branch ?? proposal.proposedBranch;
  const displayPath = filePath ?? proposal.proposedPath;
  const displayRepo = repositoryFullName ?? proposal.repositoryFullName;
  const displaySha = commitSha ? commitSha.slice(0, 8) : null;

  // Build GitHub branch URL from commit URL (e.g. https://github.com/owner/repo/commit/sha)
  const branchUrl =
    commitUrl && displayBranch
      ? commitUrl.replace(/\/commit\/[^/]+$/, `/tree/${encodeURIComponent(displayBranch)}`)
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-5 rounded-xl border p-6"
      style={{
        borderColor: "var(--state-success-soft)",
        backgroundColor: "var(--state-success-soft)",
      }}
    >
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="mt-0.5 size-5 shrink-0"
          aria-hidden="true"
          style={{ color: "var(--state-success)" }}
        />
        <div>
          <p
            className="font-semibold text-base"
            style={{ color: "var(--state-success)" }}
          >
            Commit created successfully.
          </p>
          <p
            className="mt-0.5 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Your mission has been committed to GitHub. The task is now
            completed.
          </p>
        </div>
      </div>

      <dl
        className="rounded-xl border bg-white/60 p-4 space-y-3 text-sm"
        style={{ borderColor: "var(--state-success-soft)" }}
      >
        <div className="flex flex-col gap-0.5">
          <dt
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Mission
          </dt>
          <dd style={{ color: "var(--text-primary)" }}>
            {proposal.missionTitle}
          </dd>
        </div>

        <div className="flex flex-col gap-0.5">
          <dt
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Repository
          </dt>
          <dd className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
            {displayRepo}
          </dd>
        </div>

        <div className="flex flex-col gap-0.5">
          <dt
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Branch
          </dt>
          <dd
            className="flex items-center gap-1 font-mono text-sm"
            style={{ color: "var(--text-primary)" }}
          >
            <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
            {displayBranch}
          </dd>
        </div>

        <div className="flex flex-col gap-0.5">
          <dt
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            File path
          </dt>
          <dd
            className="flex items-center gap-1 font-mono text-sm break-all"
            style={{ color: "var(--text-primary)" }}
          >
            <FileText className="size-3.5 shrink-0" aria-hidden="true" />
            {displayPath}
          </dd>
        </div>

        {displaySha && (
          <div className="flex flex-col gap-0.5">
            <dt
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Commit SHA
            </dt>
            <dd
              className="flex items-center gap-1 font-mono text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              <GitCommitHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
              {displaySha}
            </dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-3">
        {commitUrl && (
          <a
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: "var(--accent-primary)",
              color: "#fff",
            }}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            View commit on GitHub
          </a>
        )}
        {branchUrl && (
          <a
            href={branchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium cursor-pointer transition-colors hover:bg-white/60"
            style={{
              borderColor: "var(--state-success)",
              color: "var(--state-success)",
            }}
          >
            <GitBranch className="size-4" aria-hidden="true" />
            View branch on GitHub
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-4 pt-1">
        <Link
          href="/tasks"
          className="text-sm font-medium underline underline-offset-4 cursor-pointer"
          style={{ color: "var(--accent-strong)" }}
        >
          ← Back to Tasks
        </Link>
        <Link
          href="/dashboard"
          className="text-sm font-medium underline underline-offset-4 cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          Back to dashboard →
        </Link>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Main form
// --------------------------------------------------------------------------

export function CommitConfirmForm({ proposal }: CommitConfirmFormProps) {
  const [state, dispatch, isPending] = useActionState<CommitActionState, FormData>(
    confirmCommitAction,
    null
  );

  // Success state
  if (state?.ok && state.data.code === "committed") {
    return (
      <CommitSuccessState
        proposal={proposal}
        commitUrl={state.data.commitUrl}
        commitSha={state.data.commitSha}
        branch={state.data.branch}
        filePath={state.data.filePath}
        repositoryFullName={state.data.repositoryFullName}
      />
    );
  }

  // Already-committed state
  if (state?.ok && state.data.code === "already_committed") {
    return (
      <div
        role="status"
        className="space-y-4 rounded-xl border p-6"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0"
            aria-hidden="true"
            style={{ color: "var(--state-success)" }}
          />
          <p
            className="font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            This mission has already been committed.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/tasks"
            className="text-sm font-medium underline underline-offset-4 cursor-pointer"
            style={{ color: "var(--accent-strong)" }}
          >
            ← Back to Tasks
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium underline underline-offset-4 cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            Back to dashboard →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div aria-busy={isPending || undefined}>
      {/* Error state */}
      {state && !state.ok && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm"
          style={{
            borderColor: "var(--state-error-soft)",
            backgroundColor: "var(--state-error-soft)",
            color: "var(--state-error)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium" style={{ color: "var(--state-error)" }}>
              {state.error.message}
            </p>
            {/* Database error: emphasize no retry */}
            {state.error.code === "database_error" && (
              <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                Do not retry — check your GitHub repository first to see if the
                commit was created.
              </p>
            )}
          </div>
        </div>
      )}

      <form action={dispatch} className="space-y-4">
        <input type="hidden" name="taskId" value={proposal.taskId} />
        <input type="hidden" name="operationId" value={proposal.operationId} />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={isPending}
            className="cursor-pointer disabled:cursor-not-allowed"
            aria-label="Confirm and commit to GitHub"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Creating commit…
              </>
            ) : (
              <>
                <GitCommitHorizontal className="size-4" aria-hidden="true" />
                Confirm and commit
              </>
            )}
          </Button>

          <Link
            href={`/tasks/${proposal.taskId}/review`}
            className="inline-block text-sm font-medium underline underline-offset-4 cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            aria-label="Cancel and return to mission review"
          >
            Cancel
          </Link>
        </div>

        <ProgressLabel isPending={isPending} />
      </form>

      {/* Accessible description of what confirm does */}
      <p
        className="mt-4 text-xs"
        style={{ color: "var(--text-muted)" }}
        id="commit-notice"
      >
        <GitBranch className="mr-1 inline size-3" aria-hidden="true" />
        This will create branch{" "}
        <span className="font-mono">{proposal.proposedBranch}</span> and commit
        the file{" "}
        <span className="font-mono">{proposal.proposedPath}</span> to your
        repository.{" "}
        <FileText className="mr-0.5 inline size-3" aria-hidden="true" />
        No pull request will be opened automatically.
      </p>
    </div>
  );
}
