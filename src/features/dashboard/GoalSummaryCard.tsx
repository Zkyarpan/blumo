import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardData } from "./dashboard.service";

const DAILY_MINUTES_LABELS: Record<number, string> = {
  10: "10 min",
  20: "20 min",
  30: "30 min",
  45: "45 min",
  60: "1 hour",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  learning_note: "Learning note",
  coding_challenge: "Coding challenge",
  documentation: "Documentation",
  interview_preparation: "Interview preparation",
};

/** Format a date string as "Month DD, YYYY" using built-in Intl. */
function formatDate(isoString: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

interface GoalSummaryCardProps {
  goal: DashboardData["activeGoal"];
}

/**
 * Displays the user's active learning goal details.
 * Shows a recovery state with a link to /onboarding when the goal is null.
 */
export function GoalSummaryCard({ goal }: GoalSummaryCardProps) {
  if (!goal) {
    return (
      <Card
        className="rounded-xl border"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <CardHeader>
          <CardTitle
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Your learning goal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
            No active goal found. Something went wrong during setup.
          </p>
          <Link
            href="/onboarding"
            className="text-sm font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            Return to onboarding →
          </Link>
        </CardContent>
      </Card>
    );
  }

  // The goal row stores task_type; experience_level is on the profile.
  // GoalSummaryCard only knows the goal row — display what it has.
  const taskTypeLabel =
    TASK_TYPE_LABELS[goal.task_type] ?? goal.task_type;
  const dailyLabel =
    DAILY_MINUTES_LABELS[goal.daily_minutes] ?? `${goal.daily_minutes} min`;

  return (
    <Card
      className="rounded-xl border"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <CardHeader className="pb-3">
        <CardTitle
          className="text-base font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Your learning goal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="text-base font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {goal.title}
        </p>

        <div className="flex flex-wrap gap-2">
          <Badge
            className="text-xs rounded-md"
            style={{
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
            }}
          >
            {goal.technology}
          </Badge>
          <Badge
            className="text-xs rounded-md"
            style={{
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
            }}
          >
            {taskTypeLabel}
          </Badge>
          <Badge
            className="text-xs rounded-md"
            style={{
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
            }}
          >
            {dailyLabel}
          </Badge>
        </div>

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Goal active since {formatDate(goal.created_at)}
        </p>
      </CardContent>
    </Card>
  );
}
