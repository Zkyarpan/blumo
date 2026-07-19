import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface ProgressSummaryCardProps {
  completedTaskCount: number;
}

/**
 * Displays the real count of committed missions from the database.
 * Does not fabricate streaks, percentages, or sample data.
 */
export function ProgressSummaryCard({ completedTaskCount }: ProgressSummaryCardProps) {
  return (
    <Card
      className="rounded-xl border"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TrendingUp
            size={18}
            style={{ color: "var(--text-secondary)" }}
            aria-hidden="true"
          />
          <CardTitle
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Progress
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2 mb-2">
          <span
            className="text-3xl font-semibold tabular-nums"
            style={{ color: "var(--text-primary)" }}
            aria-label={`${completedTaskCount} missions completed`}
          >
            {completedTaskCount}
          </span>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            missions completed
          </span>
        </div>
        {completedTaskCount === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Start your first mission to begin tracking progress.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
