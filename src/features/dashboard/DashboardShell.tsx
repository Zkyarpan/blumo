import type { DashboardData } from "./dashboard.service";
import { GoalSummaryCard } from "./GoalSummaryCard";
import { MissionCard } from "./MissionCard";
import { GitHubConnectionCard } from "./GitHubConnectionCard";
import { ProgressSummaryCard } from "./ProgressSummaryCard";
import { RecentActivitySection } from "./RecentActivitySection";

/** Derive a time-of-day greeting from the user's stored timezone. */
function getGreeting(timezone: string | null): string {
  try {
    const tz = timezone ?? "UTC";
    const hourStr = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).format(new Date());
    const hour = parseInt(hourStr, 10);
    if (isNaN(hour)) return "Good day";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  } catch {
    return "Good day";
  }
}

/** Truncate a string to maxLen characters, adding "…" if needed. */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

interface DashboardShellProps {
  data: DashboardData;
}

/**
 * Top-level dashboard content assembly.
 * Server Component — composes all dashboard cards from pre-fetched data.
 */
export function DashboardShell({ data }: DashboardShellProps) {
  const { profile, activeGoal, completedTaskCount } = data;

  const displayName =
    profile.display_name ?? profile.github_username ?? "Developer";
  const greeting = getGreeting(profile.timezone);

  return (
    <div className="py-8 space-y-6">
      {/* Welcome header */}
      <div>
        <h1
          className="text-2xl md:text-3xl font-semibold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {greeting}, {displayName}.
        </h1>
        {activeGoal && (
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {truncate(activeGoal.title, 80)}
          </p>
        )}
      </div>

      {/* Top row: mission (2/3) + GitHub connection (1/3) */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <MissionCard />
        </div>
        <div className="md:col-span-1">
          <GitHubConnectionCard />
        </div>
      </div>

      {/* Goal summary */}
      <GoalSummaryCard goal={activeGoal} />

      {/* Progress summary */}
      <ProgressSummaryCard completedTaskCount={completedTaskCount} />

      {/* Recent activity */}
      <RecentActivitySection />
    </div>
  );
}
