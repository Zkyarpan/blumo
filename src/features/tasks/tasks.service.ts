import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type TaskStatus =
  | "generating"
  | "generated"
  | "approved"
  | "rejected"
  | "in_progress"
  | "completed"
  | "failed"
  | "archived";

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  difficulty: string | null;
  estimatedMinutes: number | null;
  scheduledDate: string;
  createdAt: string;
  repositoryFullName: string | null;
  currentVersionNumber: number | null;
  completedAt: string | null;
  approvedAt: string | null;
  generationErrorCode: string | null;
  canRetry: boolean;
}

export interface TasksPageData {
  tasks: TaskSummary[];
  activeTask: TaskSummary | null;
  hasAnyTask: boolean;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const RETRYABLE_FAILURE_CODES = new Set([
  "timed_out",
  "rate_limited",
  "temporarily_unavailable",
  "invalid_response",
  "unsafe_response",
  "unknown_provider_error",
]);

function mapRow(row: Record<string, unknown>): TaskSummary {
  const errorCode =
    typeof row.generation_error_code === "string"
      ? row.generation_error_code
      : null;
  const providerAttempts =
    typeof row.provider_generation_attempts === "number"
      ? row.provider_generation_attempts
      : 0;

  const repoRelation = row.repositories as { full_name?: unknown } | null;
  const repoFullName =
    repoRelation && typeof repoRelation.full_name === "string"
      ? repoRelation.full_name
      : null;

  const canRetry =
    row.status === "failed" &&
    providerAttempts < 3 &&
    errorCode !== null &&
    RETRYABLE_FAILURE_CODES.has(errorCode);

  return {
    id: typeof row.id === "string" ? row.id : "",
    title:
      typeof row.title === "string" && row.title
        ? row.title
        : "Untitled mission",
    status: row.status as TaskStatus,
    difficulty:
      typeof row.difficulty === "string" ? row.difficulty : null,
    estimatedMinutes:
      typeof row.estimated_minutes === "number"
        ? row.estimated_minutes
        : null,
    scheduledDate:
      typeof row.scheduled_date === "string" ? row.scheduled_date : "",
    createdAt:
      typeof row.created_at === "string" ? row.created_at : "",
    repositoryFullName: repoFullName,
    currentVersionNumber: null,
    completedAt:
      typeof row.completed_at === "string" ? row.completed_at : null,
    approvedAt:
      typeof row.approved_at === "string" ? row.approved_at : null,
    generationErrorCode: errorCode,
    canRetry,
  };
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

/**
 * Fetches all tasks for the authenticated user ordered by created_at desc.
 * Uses the anon client so RLS is enforced.
 */
export async function getTasksPageData(
  userId: string
): Promise<TasksPageData | null> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("daily_tasks")
      .select(
        [
          "id",
          "title",
          "status",
          "difficulty",
          "estimated_minutes",
          "scheduled_date",
          "created_at",
          "completed_at",
          "approved_at",
          "provider_generation_attempts",
          "generation_error_code",
          "current_mission_version_id",
          "repositories(full_name)",
        ].join(", ")
      )
      .eq("user_id", userId)
      .not("status", "eq", "archived")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return null;
    }

    const tasks = (data ?? []).map((row) =>
      mapRow(row as unknown as Record<string, unknown>)
    );

    const activeStatuses: TaskStatus[] = [
      "generating",
      "generated",
      "approved",
      "in_progress",
    ];
    const activeTask =
      tasks.find((t) => activeStatuses.includes(t.status)) ?? null;

    return {
      tasks,
      activeTask,
      hasAnyTask: tasks.length > 0,
    };
  } catch {
    return null;
  }
}
