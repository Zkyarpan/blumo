import "server-only";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CommitProposalResult,
  CommitProposalTaskRow,
  CommitProposalVersionRow,
  CommitResultCode,
} from "./commit.types";

// --------------------------------------------------------------------------
// Row schemas
// --------------------------------------------------------------------------

const taskCommitRowSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    scheduled_date: z.string(),
    status: z.string(),
    current_mission_version_id: z.string().uuid().nullable(),
    repository_id: z.string().uuid(),
    repositories: z
      .object({
        full_name: z.string(),
        default_branch: z.string(),
        access_status: z.string(),
        installation_id: z.string().uuid(),
        github_installations: z
          .object({
            id: z.string().uuid(),
            installation_id: z.number(),
            status: z.string(),
          })
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),
  })
  .strict();

const versionCommitRowSchema = z
  .object({
    id: z.string().uuid(),
    task_id: z.string().uuid(),
    user_id: z.string().uuid(),
    version_number: z.number().int().positive(),
    status: z.string(),
    title: z.string().min(1),
    description: z.string().min(1),
    acceptance_checklist: z.array(z.string()).min(2).max(6),
    suggested_commit_message: z.string().min(1),
    learning_outcome: z.string().min(1),
    ai_provider: z.string().min(1),
  })
  .strict();

const commitRowSchema = z
  .object({
    id: z.string().uuid(),
    github_commit_sha: z.string(),
    github_commit_url: z.string(),
    branch: z.string(),
    file_path: z.string(),
    status: z.string(),
  })
  .strict();

// --------------------------------------------------------------------------
// Read: load the commit proposal data through the RLS client
// --------------------------------------------------------------------------

const TASK_COMMIT_SELECT = [
  "id",
  "user_id",
  "scheduled_date",
  "status",
  "current_mission_version_id",
  "repository_id",
  "repositories(full_name, default_branch, access_status, installation_id, github_installations(id, installation_id, status))",
].join(", ");

export async function getCommitProposalData(
  userId: string,
  taskId: string
): Promise<CommitProposalResult> {
  const supabase = await createSupabaseServerClient();

  // Load task through RLS (automatically scoped to userId via policy)
  const { data: rawTask, error: taskError } = await supabase
    .from("daily_tasks")
    .select(TASK_COMMIT_SELECT)
    .eq("id", taskId)
    .eq("user_id", userId)
    .single();

  if (taskError || !rawTask) {
    return { kind: "not_found" };
  }

  const taskParsed = taskCommitRowSchema.safeParse(rawTask);
  if (!taskParsed.success) {
    return { kind: "error" };
  }

  const task = taskParsed.data;
  const repo = task.repositories;
  const installation = repo?.github_installations;

  if (!repo || !installation) {
    return { kind: "repository_unavailable" };
  }

  // Repository must be active
  if (repo.access_status !== "active") {
    return { kind: "repository_unavailable" };
  }

  // Installation must be active
  if (installation.status === "suspended") {
    return { kind: "installation_suspended" };
  }
  if (installation.status !== "active") {
    return { kind: "repository_unavailable" };
  }

  // Task must be approved (or completed with commit)
  if (task.status === "completed") {
    // Check for existing commit record
    const existing = await getExistingCommit(userId, taskId);
    if (existing) {
      return {
        kind: "already_committed",
        commitSha: existing.github_commit_sha,
        commitUrl: existing.github_commit_url,
        branch: existing.branch,
        filePath: existing.file_path,
      };
    }
    return { kind: "not_approved" };
  }

  if (task.status !== "approved") {
    return { kind: "not_approved" };
  }

  if (!task.current_mission_version_id) {
    return { kind: "error" };
  }

  // Load the current approved mission version
  const { data: rawVersion, error: versionError } = await supabase
    .from("mission_versions")
    .select(
      "id, task_id, user_id, version_number, status, title, description, acceptance_checklist, suggested_commit_message, learning_outcome, ai_provider"
    )
    .eq("id", task.current_mission_version_id)
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .single();

  if (versionError || !rawVersion) {
    return { kind: "error" };
  }

  const versionParsed = versionCommitRowSchema.safeParse(rawVersion);
  if (!versionParsed.success) {
    return { kind: "error" };
  }

  const version = versionParsed.data;

  if (version.status !== "approved") {
    return { kind: "not_approved" };
  }

  // Return the full task + version row data for the service to process
  const taskRow: CommitProposalTaskRow = {
    id: task.id,
    userId: task.user_id,
    scheduledDate: task.scheduled_date,
    status: task.status,
    currentMissionVersionId: task.current_mission_version_id,
    repositoryId: task.repository_id,
    repositoryFullName: repo.full_name,
    repositoryDefaultBranch: repo.default_branch,
    repositoryAccessStatus: repo.access_status,
    installationId: installation.id,
    installationGithubId: installation.installation_id,
    installationStatus: installation.status,
  };

  const versionRow: CommitProposalVersionRow = {
    id: version.id,
    taskId: version.task_id,
    userId: version.user_id,
    versionNumber: version.version_number,
    status: version.status,
    title: version.title,
    description: version.description,
    acceptanceChecklist: version.acceptance_checklist,
    suggestedCommitMessage: version.suggested_commit_message,
    learningOutcome: version.learning_outcome,
    aiProvider: version.ai_provider,
  };

  return { kind: "proposal", data: { taskRow, versionRow } as never };
}

/** Loads the owned task + version rows for building the commit proposal. */
export async function loadCommitProposalRows(
  userId: string,
  taskId: string
): Promise<
  | { ok: true; taskRow: CommitProposalTaskRow; versionRow: CommitProposalVersionRow }
  | { ok: false; reason: "not_found" | "not_approved" | "repository_unavailable" | "installation_suspended" | "error" }
> {
  const supabase = await createSupabaseServerClient();

  const { data: rawTask, error: taskError } = await supabase
    .from("daily_tasks")
    .select(TASK_COMMIT_SELECT)
    .eq("id", taskId)
    .eq("user_id", userId)
    .single();

  if (taskError || !rawTask) {
    return { ok: false, reason: "not_found" };
  }

  const taskParsed = taskCommitRowSchema.safeParse(rawTask);
  if (!taskParsed.success) {
    return { ok: false, reason: "error" };
  }

  const task = taskParsed.data;
  const repo = task.repositories;
  const installation = repo?.github_installations;

  if (!repo || !installation) {
    return { ok: false, reason: "repository_unavailable" };
  }

  if (repo.access_status !== "active") {
    return { ok: false, reason: "repository_unavailable" };
  }

  if (installation.status === "suspended") {
    return { ok: false, reason: "installation_suspended" };
  }

  if (installation.status !== "active") {
    return { ok: false, reason: "repository_unavailable" };
  }

  if (task.status !== "approved") {
    return { ok: false, reason: "not_approved" };
  }

  if (!task.current_mission_version_id) {
    return { ok: false, reason: "error" };
  }

  const { data: rawVersion, error: versionError } = await supabase
    .from("mission_versions")
    .select(
      "id, task_id, user_id, version_number, status, title, description, acceptance_checklist, suggested_commit_message, learning_outcome, ai_provider"
    )
    .eq("id", task.current_mission_version_id)
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .single();

  if (versionError || !rawVersion) {
    return { ok: false, reason: "error" };
  }

  const versionParsed = versionCommitRowSchema.safeParse(rawVersion);
  if (!versionParsed.success) {
    return { ok: false, reason: "error" };
  }

  const version = versionParsed.data;

  if (version.status !== "approved") {
    return { ok: false, reason: "not_approved" };
  }

  return {
    ok: true,
    taskRow: {
      id: task.id,
      userId: task.user_id,
      scheduledDate: task.scheduled_date,
      status: task.status,
      currentMissionVersionId: task.current_mission_version_id,
      repositoryId: task.repository_id,
      repositoryFullName: repo.full_name,
      repositoryDefaultBranch: repo.default_branch,
      repositoryAccessStatus: repo.access_status,
      installationId: installation.id,
      installationGithubId: installation.installation_id,
      installationStatus: installation.status,
    },
    versionRow: {
      id: version.id,
      taskId: version.task_id,
      userId: version.user_id,
      versionNumber: version.version_number,
      status: version.status,
      title: version.title,
      description: version.description,
      acceptanceChecklist: version.acceptance_checklist,
      suggestedCommitMessage: version.suggested_commit_message,
      learningOutcome: version.learning_outcome,
      aiProvider: version.ai_provider,
    },
  };
}

/** Check for an existing successful commit record for this task. */
async function getExistingCommit(userId: string, taskId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("commits")
    .select("id, github_commit_sha, github_commit_url, branch, file_path, status")
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .eq("status", "created")
    .single();
  if (!data) return null;
  const parsed = commitRowSchema.safeParse(data);
  if (!parsed.success) return null;
  return parsed.data;
}

// --------------------------------------------------------------------------
// Write: call the record_mission_commit RPC (service-role)
// --------------------------------------------------------------------------

export interface RecordCommitInput {
  userId: string;
  taskId: string;
  repositoryId: string;
  githubCommitSha: string;
  githubCommitUrl: string;
  branch: string;
  filePath: string;
  commitMessage: string;
  contentSnapshot: string;
  operationId: string;
  versionNumber: number;
}

const recordCommitResultCodes = new Set<string>([
  "committed",
  "already_committed",
  "not_found",
  "invalid_transition",
]);

export async function recordMissionCommit(
  input: RecordCommitInput
): Promise<CommitResultCode> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("record_mission_commit", {
    p_user_id: input.userId,
    p_task_id: input.taskId,
    p_repository_id: input.repositoryId,
    p_github_commit_sha: input.githubCommitSha,
    p_github_commit_url: input.githubCommitUrl,
    p_branch: input.branch,
    p_file_path: input.filePath,
    p_commit_message: input.commitMessage,
    p_content_snapshot: input.contentSnapshot,
    p_operation_id: input.operationId,
    p_version_number: input.versionNumber,
  });

  if (error || !data) {
    return "database_error";
  }

  if (!recordCommitResultCodes.has(data as string)) {
    return "database_error";
  }

  return data as CommitResultCode;
}

/**
 * Records a reconciliation_required status when GitHub succeeded but DB failed.
 * Best-effort — if this also fails, the caller must surface the mismatch.
 */
export async function recordReconciliationRequired(input: {
  userId: string;
  taskId: string;
  repositoryId: string;
  githubCommitSha: string;
  githubCommitUrl: string;
  branch: string;
  filePath: string;
  commitMessage: string;
  contentSnapshot: string;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("commits").insert({
      user_id: input.userId,
      task_id: input.taskId,
      repository_id: input.repositoryId,
      github_commit_sha: input.githubCommitSha,
      github_commit_url: input.githubCommitUrl,
      branch: input.branch,
      file_path: input.filePath,
      commit_message: input.commitMessage,
      content_snapshot: input.contentSnapshot,
      status: "reconciliation_required",
    });
  } catch {
    // Best-effort — cannot throw from a reconciliation fallback
  }
}
