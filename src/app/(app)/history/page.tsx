import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  History,
  CheckCircle2,
  XCircle,
  GitCommitHorizontal,
  Zap,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { getUser } from "@/features/auth/get-user";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  getHistoryPageData,
  type HistoryEvent,
  type HistoryEventKind,
} from "@/features/progress/history.service";

export const metadata: Metadata = {
  title: "History — Blumo",
  description: "Your mission and commit activity history.",
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatTime(isoTimestamp: string): string {
  try {
    return new Date(isoTimestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const EVENT_LABELS: Record<HistoryEventKind, string> = {
  mission_generated: "Mission generated",
  mission_approved: "Mission approved",
  mission_rejected: "Mission rejected",
  mission_regenerated: "Mission regenerated",
  mission_completed: "Mission committed",
  commit_created: "Commit created",
  commit_reconciliation_required: "Commit requires verification",
};

function EventIcon({ kind }: { kind: HistoryEventKind }) {
  const props = { className: "size-4 shrink-0", "aria-hidden": true as const };

  switch (kind) {
    case "mission_generated":
      return <Zap {...props} style={{ color: "var(--state-info)" }} />;
    case "mission_approved":
      return (
        <CheckCircle2 {...props} style={{ color: "var(--state-success)" }} />
      );
    case "mission_rejected":
      return <XCircle {...props} style={{ color: "var(--state-warning)" }} />;
    case "mission_regenerated":
      return <RefreshCw {...props} style={{ color: "var(--state-info)" }} />;
    case "mission_completed":
    case "commit_created":
      return (
        <GitCommitHorizontal
          {...props}
          style={{ color: "var(--state-success)" }}
        />
      );
    case "commit_reconciliation_required":
      return (
        <AlertCircle {...props} style={{ color: "var(--state-warning)" }} />
      );
  }
}

function EventItem({ event }: { event: HistoryEvent }) {
  const label = EVENT_LABELS[event.kind];

  const inner = (
    <div
      className="flex items-start gap-3 rounded-xl border p-4 hover:bg-[var(--bg-subtle)] transition-colors"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <div className="mt-0.5">
        <EventIcon kind={event.kind} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </span>
          {event.missionTitle && (
            <span
              className="text-sm truncate max-w-xs"
              style={{ color: "var(--text-secondary)" }}
              title={event.missionTitle}
            >
              — {event.missionTitle}
            </span>
          )}
        </div>

        <div
          className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {event.repositoryFullName && (
            <span className="font-mono">{event.repositoryFullName}</span>
          )}
          {event.branch && (
            <span className="font-mono">{event.branch}</span>
          )}
          {event.commitSha && (
            <span className="font-mono">{event.commitSha}</span>
          )}
          {event.filePath && (
            <span className="font-mono truncate max-w-xs">
              {event.filePath}
            </span>
          )}
          <span>{formatTime(event.timestamp)}</span>
        </div>

        {event.kind === "commit_reconciliation_required" && (
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--state-warning)" }}
          >
            The commit may have succeeded on GitHub but was not fully saved.
            Verify manually before retrying.
          </p>
        )}
      </div>

      {event.commitUrl && (
        <a
          href={event.commitUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-medium underline underline-offset-4 cursor-pointer"
          style={{ color: "var(--accent-strong)" }}
          aria-label="View commit on GitHub"
          onClick={(e) => e.stopPropagation()}
        >
          GitHub ↗
        </a>
      )}
    </div>
  );

  // If this event links to a mission, make it navigable
  if (
    event.missionId &&
    [
      "mission_generated",
      "mission_approved",
      "mission_rejected",
      "mission_regenerated",
    ].includes(event.kind)
  ) {
    return (
      <Link href={`/tasks/${event.missionId}/review`} className="block">
        {inner}
      </Link>
    );
  }

  if (event.missionId && event.kind === "mission_completed") {
    return (
      <Link href={`/tasks/${event.missionId}/commit`} className="block">
        {inner}
      </Link>
    );
  }

  return <div>{inner}</div>;
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default async function HistoryPage() {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const data = await getHistoryPageData(user.id);

  if (!data) {
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
            Unable to load history.
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

  return (
    <PageContainer width="wide" className="py-10">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="text-2xl font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          History
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Your mission and commit activity — every step you&apos;ve taken.
        </p>
      </div>

      {!data.hasAnyEvent ? (
        /* Empty state */
        <div
          className="rounded-xl border p-10 text-center"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <History
            className="mx-auto size-10 mb-4"
            aria-hidden="true"
            style={{ color: "var(--border-strong)" }}
          />
          <h2
            className="text-base font-semibold mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            No activity yet
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Once you generate and commit your first mission, your activity
            will appear here.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
            style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
          >
            Go to dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {data.days.map((day) => (
            <section key={day.date} aria-label={`Activity on ${day.displayDate}`}>
              <h2
                className="text-sm font-semibold mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                {day.displayDate}
              </h2>
              <div className="space-y-2">
                {day.events.map((event) => (
                  <EventItem key={event.id} event={event} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
