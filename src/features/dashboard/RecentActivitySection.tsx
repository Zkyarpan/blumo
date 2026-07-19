import { History } from "lucide-react";

/**
 * Recent activity section — renders the empty state in Unit 05.
 * Real task history is introduced in Unit 15.
 */
export function RecentActivitySection() {
  return (
    <section aria-labelledby="recent-activity-heading">
      <h2
        id="recent-activity-heading"
        className="text-base font-semibold mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        Recent activity
      </h2>

      <div
        className="rounded-lg border-2 border-dashed p-8 text-center"
        style={{ borderColor: "var(--border-default)" }}
      >
        <History
          size={32}
          className="mx-auto mb-2"
          style={{ color: "var(--border-strong)" }}
          aria-hidden="true"
        />
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          No activity yet
        </p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Completed missions will appear here.
        </p>
      </div>
    </section>
  );
}
