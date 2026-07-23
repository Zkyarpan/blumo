import { Bot, GitBranch, FileText, GitCommitHorizontal, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CommitConfirmForm } from "./CommitConfirmForm";
import type { CommitProposalData } from "./commit.types";

interface CommitProposalProps {
  proposal: CommitProposalData;
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

export function CommitProposal({ proposal }: CommitProposalProps) {
  return (
    <div className="space-y-6">
      {/* AI-generated label + notice */}
      <div
        className="flex flex-col gap-2 rounded-xl border p-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--accent-soft, #dbeafe)",
        }}
        role="note"
        aria-label="AI-generated content notice"
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
            AI-generated content
          </span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          This file was produced from your saved learning preferences and
          repository metadata. Repository contents were not inspected.{" "}
          <strong>
            Confirming will create a branch and commit a single file in your
            repository. No pull request will be opened automatically.
          </strong>{" "}
          No commit is made to the default branch directly.
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
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            style={{
              color: "var(--state-success)",
              backgroundColor: "var(--state-success-soft)",
            }}
          >
            Approved
          </Badge>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {formatDate(proposal.scheduledDate)}
          </span>
        </div>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {proposal.missionTitle}
        </h1>
      </div>

      {/* Commit details */}
      <div
        className="rounded-xl border p-6 space-y-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Commit details
        </h2>
        <dl className="space-y-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Repository
            </dt>
            <dd className="font-mono" style={{ color: "var(--text-primary)" }}>
              {proposal.repositoryFullName}
            </dd>
          </div>

          <div className="flex flex-col gap-0.5">
            <dt
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Base branch
            </dt>
            <dd
              className="flex items-center gap-1 font-mono text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
              {proposal.baseBranch}
            </dd>
          </div>

          <div className="flex flex-col gap-0.5">
            <dt
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              New branch
            </dt>
            <dd
              className="flex items-center gap-1 font-mono text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
              {proposal.proposedBranch}
            </dd>
          </div>

          <div className="flex flex-col gap-0.5">
            <dt
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              File path
            </dt>
            <dd
              className="flex items-center gap-1 font-mono text-sm break-all"
              style={{ color: "var(--text-primary)" }}
            >
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              {proposal.proposedPath}
            </dd>
          </div>

          <div className="flex flex-col gap-0.5">
            <dt
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Commit message
            </dt>
            <dd
              className="flex items-center gap-1 font-mono text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              <GitCommitHorizontal
                className="size-3.5 shrink-0"
                aria-hidden="true"
              />
              {proposal.commitMessage}
            </dd>
          </div>
        </dl>
      </div>

      {/* File content preview — always visible before confirm */}
      <div
        className="rounded-xl border"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-2"
          style={{ borderColor: "var(--border-default)" }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {proposal.proposedPath}
          </span>
          <span
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
            aria-label="Read-only preview"
          >
            Preview (read-only)
          </span>
        </div>
        <pre
          aria-label="Proposed file content"
          className="overflow-auto p-4 text-xs leading-relaxed font-mono"
          style={{
            color: "var(--text-secondary)",
            maxHeight: "400px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {proposal.proposedContent}
        </pre>
      </div>

      <Separator />

      {/* Confirm / cancel */}
      <section aria-label="Confirm commit">
        <h2
          className="mb-4 text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Confirm and create commit
        </h2>
        <CommitConfirmForm proposal={proposal} />
      </section>
    </div>
  );
}

// --------------------------------------------------------------------------
// Error sub-states (used by the page when preconditions fail)
// --------------------------------------------------------------------------

export function CommitNotApproved({ taskId }: { taskId: string }) {
  return (
    <div
      className="rounded-xl border p-6 space-y-4"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        This mission has not been approved yet. Approve it first before
        creating a commit.
      </p>
      <Link
        href={`/tasks/${taskId}/review`}
        className="inline-block text-sm font-medium underline underline-offset-4"
        style={{ color: "var(--accent-strong)" }}
      >
        Go to mission review →
      </Link>
    </div>
  );
}

export function CommitRepositoryUnavailable() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border p-6 space-y-2"
      style={{
        borderColor: "var(--state-warning)",
        backgroundColor: "var(--state-warning-soft, #fef9c3)",
      }}
    >
      <AlertCircle
        className="mt-0.5 size-5 shrink-0"
        aria-hidden="true"
        style={{ color: "var(--state-warning)" }}
      />
      <div>
        <p className="font-medium" style={{ color: "var(--text-primary)" }}>
          Repository access unavailable
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Your selected repository or GitHub App installation is no longer
          accessible. Restore access before creating a commit.
        </p>
        <Link
          href="/github/repositories"
          className="mt-2 inline-block text-sm font-medium underline underline-offset-4"
          style={{ color: "var(--accent-strong)" }}
        >
          Manage repositories →
        </Link>
      </div>
    </div>
  );
}

export function CommitInstallationSuspended() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border p-6"
      style={{
        borderColor: "var(--state-warning)",
        backgroundColor: "var(--state-warning-soft, #fef9c3)",
      }}
    >
      <AlertCircle
        className="mt-0.5 size-5 shrink-0"
        aria-hidden="true"
        style={{ color: "var(--state-warning)" }}
      />
      <div>
        <p className="font-medium" style={{ color: "var(--text-primary)" }}>
          GitHub access is suspended
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          The GitHub App installation is currently suspended. Your mission
          has not been deleted. Restore the installation to continue.
        </p>
        <a
          href="https://github.com/settings/installations"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium underline underline-offset-4"
          style={{ color: "var(--accent-strong)" }}
        >
          Manage GitHub access →
        </a>
      </div>
    </div>
  );
}

export function CommitAlreadyCommitted({
  commitSha,
  commitUrl,
  branch,
  filePath,
}: {
  commitSha: string;
  commitUrl: string;
  branch: string;
  filePath: string;
}) {
  return (
    <div
      role="status"
      className="rounded-xl border p-6 space-y-4"
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
        <div>
          <p
            className="font-semibold"
            style={{ color: "var(--state-success)" }}
          >
            This mission has already been committed.
          </p>
        </div>
      </div>
      <dl
        className="space-y-2 text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Commit SHA
          </dt>
          <dd className="font-mono text-sm">{commitSha.slice(0, 8)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Branch
          </dt>
          <dd className="font-mono text-sm">{branch}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            File path
          </dt>
          <dd className="font-mono text-sm break-all">{filePath}</dd>
        </div>
      </dl>
      {commitUrl && (
        <a
          href={commitUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium underline underline-offset-4"
          style={{ color: "var(--accent-strong)" }}
        >
          View commit on GitHub →
        </a>
      )}
      <Link
        href="/dashboard"
        className="block text-sm font-medium underline underline-offset-4"
        style={{ color: "var(--text-muted)" }}
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}
