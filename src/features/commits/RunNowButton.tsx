"use client";

import { useActionState } from "react";
import { Zap, Loader2, CheckCircle2, AlertCircle, ExternalLink, Clock } from "lucide-react";
import { triggerAutoCommitNowAction, type TriggerAutoCommitResult } from "./auto-commit-trigger.actions";

export function RunNowButton() {
  const [state, action, pending] = useActionState<TriggerAutoCommitResult | null, FormData>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_previousState, _fd) => triggerAutoCommitNowAction(),
    null
  );

  // "already_committed_today" is a soft success — not an error
  const alreadyDone =
    state && !state.ok && state.error.code === "already_committed_today";

  return (
    <div className="space-y-3">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Zap className="size-4" aria-hidden="true" />
          )}
          {pending ? "Generating & committing…" : "Run auto-commit now"}
        </button>
      </form>

      {/* New commit success */}
      {state?.ok && (
        <div
          className="rounded-xl border p-4 space-y-2"
          style={{ borderColor: "var(--state-success)", backgroundColor: "var(--bg-surface)" }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--state-success)" }} aria-hidden="true" />
            <span className="text-sm font-medium" style={{ color: "var(--state-success)" }}>
              Commit created!
            </span>
          </div>
          <div className="text-sm space-y-1" style={{ color: "var(--text-secondary)" }}>
            <p><span style={{ color: "var(--text-muted)" }}>Mission:</span> {state.data.missionTitle}</p>
            <p>
              <span style={{ color: "var(--text-muted)" }}>Repo:</span>{" "}
              <span className="font-mono">{state.data.repositoryFullName}</span>
            </p>
            <p>
              <span style={{ color: "var(--text-muted)" }}>Branch:</span>{" "}
              <span className="font-mono">{state.data.branch}</span>
            </p>
            <p>
              <span style={{ color: "var(--text-muted)" }}>SHA:</span>{" "}
              <span className="font-mono">{state.data.commitSha}</span>
            </p>
          </div>
          {state.data.commitUrl && (
            <a
              href={state.data.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
              style={{ color: "var(--accent-strong)" }}
            >
              View on GitHub <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {/* Already committed today — show as info, not error */}
      {alreadyDone && (
        <div
          className="flex items-start gap-2 rounded-xl border p-4"
          style={{ borderColor: "var(--state-success)", backgroundColor: "var(--bg-surface)" }}
        >
          <Clock className="size-4 mt-0.5 shrink-0" style={{ color: "var(--state-success)" }} aria-hidden="true" />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--state-success)" }}>
              Already committed today
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Your next auto-commit will run automatically at the scheduled time. No action needed.
            </p>
          </div>
        </div>
      )}

      {/* Real errors */}
      {state && !state.ok && !alreadyDone && (
        <div
          className="flex items-start gap-2 rounded-xl border p-4"
          role="alert"
          style={{ borderColor: "var(--state-error)", backgroundColor: "var(--bg-surface)" }}
        >
          <AlertCircle className="size-4 mt-0.5 shrink-0" style={{ color: "var(--state-error)" }} aria-hidden="true" />
          <p className="text-sm" style={{ color: "var(--state-error)" }}>
            {state.error.message}
          </p>
        </div>
      )}
    </div>
  );
}
