import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  GitCommitHorizontal,
  Zap,
  Calendar,
  TrendingUp,
  Clock,
  ExternalLink,
  CheckCircle2,
  Bot,
  User,
  Settings2,
} from "lucide-react";
import { getUser } from "@/features/auth/get-user";
import { PageContainer } from "@/components/layout/PageContainer";
import { getAutoCommitsPageData } from "@/features/commits/auto-commits.service";
import { AutoCommitSettings } from "@/features/settings/AutoCommitSettings";
import { RunNowButton } from "@/features/commits/RunNowButton";

export const metadata: Metadata = {
  title: "Auto-commits — Blumo",
  description: "Your automated daily GitHub commits — stats, history, and schedule.",
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

// --------------------------------------------------------------------------
// Stat card
// --------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-2"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: accent ? "var(--accent-primary)" : "var(--border-default)",
      }}
    >
      <div className="flex items-center gap-2">
        <Icon
          className="size-4"
          aria-hidden={true}
          // @ts-expect-error style prop
          style={{ color: accent ? "var(--accent-primary)" : "var(--text-muted)" }}
        />
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      </div>
      <div>
        <p
          className="text-3xl font-bold tabular-nums"
          style={{ color: "var(--text-primary)" }}
        >
          {value}
        </p>
        {sub && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default async function AutoCommitsPage() {
  const user = await getUser();
  if (!user) notFound();

  const data = await getAutoCommitsPageData(user.id);

  if (!data) {
    return (
      <PageContainer width="wide" className="py-10">
        <div
          role="alert"
          className="rounded-xl border p-6"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
        >
          <p className="font-medium" style={{ color: "var(--state-error)" }}>
            Unable to load auto-commit data.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            <Link href="/dashboard" className="underline underline-offset-4" style={{ color: "var(--accent-primary)" }}>
              Return to the dashboard
            </Link>
          </p>
        </div>
      </PageContainer>
    );
  }

  const { stats, recentCommits, hasAnyCommit } = data;
  const { schedule } = stats;

  return (
    <PageContainer width="wide" className="py-10">
      {/* ── Page header ─────────────────────────────────── */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-semibold mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            Auto-commits
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Blumo generates and commits a daily mission to GitHub automatically on your behalf.
          </p>
        </div>

        {/* Schedule status pill */}
        <div
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
          style={{
            borderColor: schedule ? "var(--state-success)" : "var(--border-default)",
            color: schedule ? "var(--state-success)" : "var(--text-muted)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: schedule ? "var(--state-success)" : "var(--border-strong)" }}
          />
          {schedule
            ? `Active · daily at ${schedule.localTime} (${schedule.timezone})`
            : "Auto-commit disabled"}
        </div>
      </div>

      {/* ── Stats grid ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total commits"
          value={stats.totalCommits}
          sub="all time via Blumo"
          icon={GitCommitHorizontal}
          accent={stats.totalCommits > 0}
        />
        <StatCard
          label="Auto-commits"
          value={stats.autoCommits}
          sub={`${stats.manualCommits} manual`}
          icon={Bot}
        />
        <StatCard
          label="Current streak"
          value={stats.currentStreak}
          sub={`longest: ${stats.longestStreak} days`}
          icon={TrendingUp}
        />
        <StatCard
          label="Last commit"
          value={stats.lastCommitAt ? timeAgo(stats.lastCommitAt) : "—"}
          sub={stats.lastCommitAt ? formatDate(stats.lastCommitAt) : "No commits yet"}
          icon={Clock}
        />
      </div>

      {/* ── Two-column layout ───────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Left: commit list (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">

          {/* Run now */}
          <section
            className="rounded-xl border p-5"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Zap className="size-4" aria-hidden="true" style={{ color: "var(--accent-primary)" }} />
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Run now
              </h2>
            </div>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Trigger an immediate auto-commit right now — Blumo will generate today&apos;s mission,
              auto-approve it, and push it to your selected repository.
            </p>
            <RunNowButton />
          </section>

          {/* Commit history */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <GitCommitHorizontal className="size-4" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Commit history
              </h2>
              {hasAnyCommit && (
                <span
                  className="ml-auto text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {stats.totalCommits} total
                </span>
              )}
            </div>

            {!hasAnyCommit ? (
              <div
                className="rounded-xl border p-10 text-center"
                style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
              >
                <GitCommitHorizontal
                  className="mx-auto size-10 mb-4"
                  aria-hidden="true"
                  style={{ color: "var(--border-strong)" }}
                />
                <h3
                  className="text-base font-semibold mb-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  No commits yet
                </h3>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Enable auto-commit or use{" "}
                  <span className="font-medium">Run now</span> above to create your first commit.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentCommits.map((commit) => (
                  <div
                    key={commit.id}
                    className="rounded-xl border p-4"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-default)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Title row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {commit.isAutoCommit ? (
                            <span
                              className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "var(--accent-soft)",
                                color: "var(--accent-strong)",
                              }}
                            >
                              <Bot className="size-3" aria-hidden="true" />
                              Auto
                            </span>
                          ) : (
                            <span
                              className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "var(--bg-subtle)",
                                color: "var(--text-muted)",
                              }}
                            >
                              <User className="size-3" aria-hidden="true" />
                              Manual
                            </span>
                          )}
                          <span
                            className="text-sm font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                            title={commit.missionTitle}
                          >
                            {commit.missionTitle}
                          </span>
                        </div>

                        {/* Meta row */}
                        <div
                          className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {commit.repositoryFullName && (
                            <span className="flex items-center gap-1">
                              <GitCommitHorizontal className="size-3" aria-hidden="true" />
                              <span className="font-mono">{commit.repositoryFullName}</span>
                            </span>
                          )}
                          {commit.branch && (
                            <span className="font-mono">{commit.branch}</span>
                          )}
                          {commit.commitSha && (
                            <span className="font-mono">{commit.commitSha}</span>
                          )}
                          {commit.filePath && (
                            <span className="font-mono truncate max-w-[200px]">{commit.filePath}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3" aria-hidden="true" />
                            {formatDateTime(commit.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* GitHub link */}
                      {commit.commitUrl && (
                        <a
                          href={commit.commitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4"
                          style={{ color: "var(--accent-strong)" }}
                          aria-label="View commit on GitHub"
                        >
                          GitHub <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}

                {stats.totalCommits > 50 && (
                  <p className="text-xs text-center pt-2" style={{ color: "var(--text-muted)" }}>
                    Showing 50 most recent. Full history is in{" "}
                    <Link href="/history" className="underline underline-offset-4" style={{ color: "var(--accent-primary)" }}>
                      History
                    </Link>.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right: schedule + repo breakdown (1/3 width) */}
        <div className="space-y-4">

          {/* Schedule card */}
          <section
            className="rounded-xl border"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
          >
            <div
              className="flex items-center gap-2 border-b px-5 py-4"
              style={{ borderColor: "var(--border-default)" }}
            >
              <Settings2 className="size-4" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Schedule
              </h2>
            </div>
            <div className="px-5 py-4">
              <AutoCommitSettings
                schedule={stats.schedule}
                userTimezone={stats.schedule?.timezone ?? data.userTimezone}
              />
            </div>
          </section>

          {/* Repository breakdown */}
          {stats.repositoryCounts.length > 0 && (
            <section
              className="rounded-xl border"
              style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}
            >
              <div
                className="flex items-center gap-2 border-b px-5 py-4"
                style={{ borderColor: "var(--border-default)" }}
              >
                <GitCommitHorizontal className="size-4" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Repositories
                </h2>
              </div>
              <div className="px-5 py-4 space-y-2">
                {stats.repositoryCounts.map(({ fullName, count }) => (
                  <div key={fullName} className="flex items-center justify-between gap-2">
                    <span
                      className="text-xs font-mono truncate"
                      style={{ color: "var(--text-secondary)" }}
                      title={fullName}
                    >
                      {fullName}
                    </span>
                    <span
                      className="shrink-0 text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--bg-subtle)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Next commit info */}
          {schedule && (
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="size-3.5" aria-hidden="true" style={{ color: "var(--state-success)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--state-success)" }}>
                  Auto-commit is active
                </span>
              </div>
              {schedule.nextRunAt && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Next run:{" "}
                  <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    {formatDateTime(schedule.nextRunAt)}
                  </span>
                </p>
              )}
              {schedule.lastRunAt && (
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Last run:{" "}
                  <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    {formatDateTime(schedule.lastRunAt)}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
