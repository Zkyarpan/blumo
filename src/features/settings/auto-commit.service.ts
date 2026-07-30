import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateMissionForUser } from "@/features/missions/mission-generation.service";
import { executeCommit } from "@/features/commits/commit-proposal.service";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type AutoCommitResultCode =
  | "committed"
  | "already_committed_today"
  | "no_active_goal"
  | "no_active_repository"
  | "installation_suspended"
  | "generation_failed"
  | "approve_failed"
  | "commit_failed"
  | "database_error";

export interface AutoCommitResult {
  userId: string;
  scheduleId: string;
  code: AutoCommitResultCode;
  commitUrl?: string;
  commitSha?: string;
  branch?: string;
  filePath?: string;
  taskId?: string;
  missionTitle?: string;
  repositoryFullName?: string;
}

// --------------------------------------------------------------------------
// Auto-approve a generated mission (service-role only)
// --------------------------------------------------------------------------

async function autoApproveMission(
  userId: string,
  taskId: string
): Promise<"approved" | "already_approved" | "not_approvable" | "error"> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("auto_approve_mission", {
      p_user_id: userId,
      p_task_id: taskId,
    });
    if (error) return "error";
    if (data === "approved" || data === "already_approved") return data as "approved" | "already_approved";
    return "not_approvable";
  } catch {
    return "error";
  }
}

// --------------------------------------------------------------------------
// Check if user already has a commit in the last 20 hours (skip if so).
// Uses the commits table directly — not scheduled_date — so it works
// regardless of which date the task was originally scheduled for.
// --------------------------------------------------------------------------

async function hasCommitInLast20Hours(userId: string): Promise<boolean> {
  try {
    const admin = createSupabaseAdminClient();
    const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("commits")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["created", "reconciled"])
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();

    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// Load minimal mission title + repo for email (best effort)
// --------------------------------------------------------------------------

async function loadCommitContext(userId: string, taskId: string): Promise<{
  missionTitle: string;
  repositoryFullName: string;
} | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("daily_tasks")
      .select("title, repositories(full_name)")
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) return null;
    const repoRelation = data.repositories as { full_name?: string } | null;
    return {
      missionTitle: typeof data.title === "string" ? data.title : "Daily mission",
      repositoryFullName: repoRelation?.full_name ?? "",
    };
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Run the full auto-commit pipeline for one user
// --------------------------------------------------------------------------

export async function runAutoCommitForUser(
  userId: string,
  scheduleId: string
): Promise<AutoCommitResult> {
  // 1. Skip if there's already a commit in the last 20 hours
  const alreadyDone = await hasCommitInLast20Hours(userId);
  if (alreadyDone) {
    return { userId, scheduleId, code: "already_committed_today" };
  }

  // 2. Generate the mission using the existing service
  const genResult = await generateMissionForUser(userId);

  if (!genResult.ok) {
    const code = genResult.code;
    if (code === "no_active_goal") return { userId, scheduleId, code: "no_active_goal" };
    if (code === "no_active_repository") return { userId, scheduleId, code: "no_active_repository" };
    // For all other generation failures, report generation_failed
    return { userId, scheduleId, code: "generation_failed" };
  }

  const taskId = genResult.taskId;

  // 3. If the mission was already existing/in_progress, it means a previous
  //    auto-commit attempt left it in generated state. We still want to approve+commit it.
  // 4. Auto-approve the mission
  const approveResult = await autoApproveMission(userId, taskId);
  if (approveResult === "error" || approveResult === "not_approvable") {
    return { userId, scheduleId, code: "approve_failed", taskId };
  }

  // 5. Execute the commit using the existing service
  const commitResult = await executeCommit(userId, taskId);

  if (commitResult.code !== "committed" && commitResult.code !== "already_committed") {
    const commitCode = commitResult.code;
    if (commitCode === "installation_suspended") {
      return { userId, scheduleId, code: "installation_suspended", taskId };
    }
    if (commitCode === "repository_unavailable") {
      return { userId, scheduleId, code: "no_active_repository", taskId };
    }
    return { userId, scheduleId, code: "commit_failed", taskId };
  }

  // 6. Load context for the notification email
  const ctx = await loadCommitContext(userId, taskId);

  const isNewCommit = commitResult.code === "committed";
  const commitUrl = isNewCommit && "commitUrl" in commitResult ? commitResult.commitUrl : undefined;
  const commitSha = isNewCommit && "commitSha" in commitResult ? commitResult.commitSha : undefined;
  const branch = isNewCommit && "branch" in commitResult ? commitResult.branch : undefined;
  const filePath = isNewCommit && "filePath" in commitResult ? commitResult.filePath : undefined;

  return {
    userId,
    scheduleId,
    code: "committed",
    taskId,
    commitUrl,
    commitSha,
    branch,
    filePath,
    missionTitle: ctx?.missionTitle,
    repositoryFullName: ctx?.repositoryFullName,
  };
}
