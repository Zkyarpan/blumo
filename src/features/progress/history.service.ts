import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type HistoryEventKind =
  | "mission_generated"
  | "mission_approved"
  | "mission_rejected"
  | "mission_regenerated"
  | "mission_completed"
  | "commit_created"
  | "commit_reconciliation_required";

export interface HistoryEvent {
  id: string;
  kind: HistoryEventKind;
  timestamp: string;
  missionTitle: string | null;
  missionId: string | null;
  repositoryFullName: string | null;
  status: string;
  commitSha: string | null;
  commitUrl: string | null;
  branch: string | null;
  filePath: string | null;
}

export interface HistoryDay {
  date: string;
  displayDate: string;
  events: HistoryEvent[];
}

export interface HistoryPageData {
  days: HistoryDay[];
  hasAnyEvent: boolean;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatDisplayDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function toLocalDate(isoTimestamp: string): string {
  // Use the date portion for grouping; we use UTC-based date to avoid
  // server timezone confusion. The timestamp is stored in UTC.
  return isoTimestamp.slice(0, 10);
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

/**
 * Fetches the authenticated user's activity history.
 * Sources: audit_logs + commits.
 * Never exposes sensitive audit metadata, tokens, or provider payloads.
 */
export async function getHistoryPageData(
  userId: string
): Promise<HistoryPageData | null> {
  try {
    const supabase = await createSupabaseServerClient();

    // Load recent audit events — only safe/allowlisted actions
    const { data: auditData, error: auditError } = await supabase
      .from("audit_logs")
      .select(
        "id, action, resource_type, resource_id, metadata, created_at"
      )
      .eq("user_id", userId)
      .in("action", [
        "mission_generated",
        "mission_approved",
        "mission_rejected",
        "mission_regeneration_succeeded",
        "mission_committed",
      ])
      .order("created_at", { ascending: false })
      .limit(100);

    if (auditError) {
      return null;
    }

    // Load commits for this user
    const { data: commitData, error: commitError } = await supabase
      .from("commits")
      .select(
        "id, task_id, github_commit_sha, github_commit_url, branch, file_path, status, created_at, repositories(full_name)"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (commitError) {
      return null;
    }

    // Load task titles for referenced task IDs
    const taskIds = new Set<string>();
    for (const row of auditData ?? []) {
      if (
        typeof row.resource_id === "string" &&
        row.resource_type === "task"
      ) {
        taskIds.add(row.resource_id);
      }
    }
    for (const row of commitData ?? []) {
      if (typeof row.task_id === "string") {
        taskIds.add(row.task_id);
      }
    }

    const taskTitleMap: Record<string, string> = {};
    const taskRepoMap: Record<string, string> = {};

    if (taskIds.size > 0) {
      const { data: taskRows } = await supabase
        .from("daily_tasks")
        .select("id, title, repositories(full_name)")
        .eq("user_id", userId)
        .in("id", [...taskIds]);

      for (const row of taskRows ?? []) {
        if (typeof row.id === "string") {
          taskTitleMap[row.id] =
            typeof row.title === "string" ? row.title : "Untitled mission";
          const repoRel = row.repositories as { full_name?: unknown } | null;
          if (repoRel && typeof repoRel.full_name === "string") {
            taskRepoMap[row.id] = repoRel.full_name;
          }
        }
      }
    }

    // Map events
    const events: HistoryEvent[] = [];

    // Map audit events
    for (const row of auditData ?? []) {
      const taskId =
        typeof row.resource_id === "string" &&
        row.resource_type === "task"
          ? row.resource_id
          : null;

      const kind = mapAuditAction(row.action as string);
      if (!kind) continue;

      // Do not expose raw metadata; derive only safe fields
      const meta = row.metadata as Record<string, unknown> | null;
      const repoFromMeta =
        meta && typeof meta.repository_full_name === "string"
          ? meta.repository_full_name
          : null;

      events.push({
        id: row.id,
        kind,
        timestamp: row.created_at,
        missionTitle: taskId ? (taskTitleMap[taskId] ?? null) : null,
        missionId: taskId,
        repositoryFullName:
          repoFromMeta ?? (taskId ? (taskRepoMap[taskId] ?? null) : null),
        status: row.action as string,
        commitSha: null,
        commitUrl: null,
        branch: null,
        filePath: null,
      });
    }

    // Map commit events (supplement audit — may overlap for commit_created)
    for (const row of commitData ?? []) {
      const taskId = typeof row.task_id === "string" ? row.task_id : null;

      // Avoid duplicate with audit — skip if there's already a mission_committed
      // audit event for the same task. We keep commit rows for reconciliation_required.
      const kind: HistoryEventKind =
        row.status === "reconciliation_required"
          ? "commit_reconciliation_required"
          : "commit_created";

      if (
        kind === "commit_created" &&
        events.some(
          (e) =>
            e.kind === "commit_created" && e.missionId === taskId
        )
      ) {
        continue;
      }

      const repoRel = row.repositories as { full_name?: unknown } | null;
      const repoFullName =
        repoRel && typeof repoRel.full_name === "string"
          ? repoRel.full_name
          : null;

      events.push({
        id: `commit-${row.id}`,
        kind,
        timestamp: row.created_at,
        missionTitle: taskId ? (taskTitleMap[taskId] ?? null) : null,
        missionId: taskId,
        repositoryFullName:
          repoFullName ?? (taskId ? (taskRepoMap[taskId] ?? null) : null),
        status: row.status as string,
        // Shorten SHA but never expose full token-like values
        commitSha:
          typeof row.github_commit_sha === "string"
            ? row.github_commit_sha.slice(0, 8)
            : null,
        commitUrl:
          typeof row.github_commit_url === "string"
            ? row.github_commit_url
            : null,
        branch: typeof row.branch === "string" ? row.branch : null,
        filePath:
          typeof row.file_path === "string" ? row.file_path : null,
      });
    }

    // Sort all events by timestamp desc
    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Group by date
    const dayMap = new Map<string, HistoryEvent[]>();
    for (const event of events) {
      const date = toLocalDate(event.timestamp);
      if (!dayMap.has(date)) {
        dayMap.set(date, []);
      }
      dayMap.get(date)!.push(event);
    }

    const days: HistoryDay[] = [];
    for (const [date, dayEvents] of dayMap) {
      days.push({
        date,
        displayDate: formatDisplayDate(date),
        events: dayEvents,
      });
    }

    // Sort days descending
    days.sort((a, b) => b.date.localeCompare(a.date));

    return {
      days,
      hasAnyEvent: events.length > 0,
    };
  } catch {
    return null;
  }
}

function mapAuditAction(action: string): HistoryEventKind | null {
  switch (action) {
    case "mission_generated":
      return "mission_generated";
    case "mission_approved":
      return "mission_approved";
    case "mission_rejected":
      return "mission_rejected";
    case "mission_regeneration_succeeded":
      return "mission_regenerated";
    case "mission_committed":
      return "mission_completed";
    default:
      return null;
  }
}
