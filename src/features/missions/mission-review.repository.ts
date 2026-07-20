import "server-only";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  MissionReviewResult,
  ApproveResultCode,
  RejectResultCode,
} from "./mission-review.types";
import type { MissionOutput } from "./mission-output.schema";
import type { MissionUsageRecord } from "./mission-generation.repository";

// --------------------------------------------------------------------------
// Read model schema — validated before returning to service layer
// --------------------------------------------------------------------------

const missionVersionRowSchema = z
  .object({
    id: z.string().uuid(),
    task_id: z.string().uuid(),
    user_id: z.string().uuid(),
    version_number: z.number().int().positive(),
    status: z.enum(["generated", "approved", "rejected"]),
    title: z.string().min(1),
    description: z.string().min(1),
    estimated_minutes: z.union([
      z.literal(10),
      z.literal(20),
      z.literal(30),
      z.literal(45),
      z.literal(60),
    ]),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    acceptance_checklist: z.array(z.string()).min(2).max(6),
    suggested_commit_message: z.string().min(1),
    suggested_branch: z.string().min(1),
    learning_outcome: z.string().min(1),
    ai_provider: z.string().min(1),
    prompt_version: z.string().min(1),
    generation_claim_version: z.number().int().positive(),
    approved_at: z.string().nullable(),
    rejected_at: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();

const taskReviewRowSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    scheduled_date: z.string(),
    status: z.enum([
      "generated",
      "approved",
      "rejected",
      "in_progress",
      "completed",
      "failed",
      "generating",
      "archived",
    ]),
    review_operation_status: z.enum(["idle", "regenerating"]),
    regeneration_count: z.number().int().min(0).max(2),
    approved_at: z.string().nullable(),
    rejected_at: z.string().nullable(),
    current_mission_version_id: z.string().uuid().nullable(),
    repositories: z
      .object({
        full_name: z.string().nullable(),
        access_status: z.string().nullable(),
        installation: z
          .object({ status: z.string().nullable() })
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),
  })
  .strict();

// --------------------------------------------------------------------------
// Read: load owned task + current version through RLS client
// --------------------------------------------------------------------------

const TASK_REVIEW_SELECT = [
  "id",
  "user_id",
  "scheduled_date",
  "status",
  "review_operation_status",
  "regeneration_count",
  "approved_at",
  "rejected_at",
  "current_mission_version_id",
  "repositories(full_name, access_status, github_installations(status))",
].join(", ");

export async function getMissionReviewById(
  userId: string,
  taskId: string
): Promise<MissionReviewResult> {
  try {
    const client = await createSupabaseServerClient();

    const { data: taskData, error: taskError } = await client
      .from("daily_tasks")
      .select(TASK_REVIEW_SELECT)
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle();

    if (taskError) return { kind: "error" };
    if (!taskData) return { kind: "not_found" };

    // Cast to loose type to normalize nested Supabase relation shape
    const rawRecord = taskData as unknown as Record<string, unknown>;
    const repoField = rawRecord.repositories as Record<string, unknown> | null;
    const rawTask: Record<string, unknown> = {
      ...rawRecord,
      repositories: repoField && !Array.isArray(repoField)
        ? {
            full_name: repoField.full_name ?? null,
            access_status: repoField.access_status ?? null,
            installation: (() => {
              const inst = repoField.github_installations;
              if (Array.isArray(inst)) return inst[0] ?? null;
              return inst ?? null;
            })(),
          }
        : null,
    };

    const taskParsed = taskReviewRowSchema.safeParse(rawTask);
    if (!taskParsed.success) return { kind: "invalid" };
    const task = taskParsed.data;

    if (!task.current_mission_version_id) {
      // Task exists but has no current version (e.g. failed/generating)
      return {
        kind: "found",
        data: {
          task: {
            id: task.id,
            userId: task.user_id,
            scheduledDate: task.scheduled_date,
            status: task.status as
              | "generated"
              | "approved"
              | "rejected"
              | "in_progress"
              | "completed",
            reviewOperationStatus: task.review_operation_status,
            regenerationCount: task.regeneration_count,
            approvedAt: task.approved_at,
            rejectedAt: task.rejected_at,
            currentMissionVersionId: null,
            repositoryFullName: task.repositories?.full_name ?? null,
            repositoryAccessStatus: task.repositories?.access_status ?? null,
            installationStatus:
              task.repositories?.installation?.status ?? null,
          },
          currentVersion: null as unknown as import("./mission-review.types").MissionVersion,
        },
      };
    }

    const { data: versionData, error: versionError } = await client
      .from("mission_versions")
      .select(
        "id, task_id, user_id, version_number, status, title, description, estimated_minutes, difficulty, acceptance_checklist, suggested_commit_message, suggested_branch, learning_outcome, ai_provider, prompt_version, generation_claim_version, approved_at, rejected_at, created_at"
      )
      .eq("id", task.current_mission_version_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (versionError) return { kind: "error" };
    if (!versionData) return { kind: "not_found" };

    const versionParsed = missionVersionRowSchema.safeParse(versionData);
    if (!versionParsed.success) return { kind: "invalid" };
    const version = versionParsed.data;

    return {
      kind: "found",
      data: {
        task: {
          id: task.id,
          userId: task.user_id,
          scheduledDate: task.scheduled_date,
          status: task.status as
            | "generated"
            | "approved"
            | "rejected"
            | "in_progress"
            | "completed",
          reviewOperationStatus: task.review_operation_status,
          regenerationCount: task.regeneration_count,
          approvedAt: task.approved_at,
          rejectedAt: task.rejected_at,
          currentMissionVersionId: task.current_mission_version_id,
          repositoryFullName: task.repositories?.full_name ?? null,
          repositoryAccessStatus: task.repositories?.access_status ?? null,
          installationStatus:
            task.repositories?.installation?.status ?? null,
        },
        currentVersion: {
          id: version.id,
          taskId: version.task_id,
          userId: version.user_id,
          versionNumber: version.version_number,
          status: version.status,
          title: version.title,
          description: version.description,
          estimatedMinutes: version.estimated_minutes,
          difficulty: version.difficulty,
          acceptanceChecklist: version.acceptance_checklist,
          suggestedCommitMessage: version.suggested_commit_message,
          suggestedBranch: version.suggested_branch,
          learningOutcome: version.learning_outcome,
          aiProvider: version.ai_provider,
          promptVersion: version.prompt_version,
          generationClaimVersion: version.generation_claim_version,
          approvedAt: version.approved_at,
          rejectedAt: version.rejected_at,
          createdAt: version.created_at,
        },
      },
    };
  } catch {
    return { kind: "error" };
  }
}

// --------------------------------------------------------------------------
// Approve
// --------------------------------------------------------------------------

const approveResultCodes = new Set([
  "approved",
  "already_approved",
  "not_found",
  "repository_unavailable",
  "stale_version",
  "invalid_transition",
]);

export async function approveMissionVersion(
  userId: string,
  taskId: string,
  versionId: string
): Promise<ApproveResultCode> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("approve_mission_version", {
      p_user_id: userId,
      p_task_id: taskId,
      p_version_id: versionId,
    });
    if (error || typeof data !== "string" || !approveResultCodes.has(data)) {
      return "database_error";
    }
    return data as ApproveResultCode;
  } catch {
    return "database_error";
  }
}

// --------------------------------------------------------------------------
// Reject
// --------------------------------------------------------------------------

const rejectResultCodes = new Set([
  "rejected",
  "already_rejected",
  "not_found",
  "stale_version",
  "invalid_transition",
]);

export async function rejectMissionVersion(
  userId: string,
  taskId: string,
  versionId: string,
  reason: string | null
): Promise<RejectResultCode> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("reject_mission_version", {
      p_user_id: userId,
      p_task_id: taskId,
      p_version_id: versionId,
      p_rejection_reason: reason,
    });
    if (error || typeof data !== "string" || !rejectResultCodes.has(data)) {
      return "database_error";
    }
    return data as RejectResultCode;
  } catch {
    return "database_error";
  }
}

// --------------------------------------------------------------------------
// Regeneration claim
// --------------------------------------------------------------------------

const claimRegenSchema = z
  .object({
    result: z.enum([
      "claimed",
      "duplicate",
      "duplicate_succeeded",
      "not_found",
      "repository_unavailable",
      "stale_version",
      "invalid_transition",
      "usage_limit_reached",
    ]),
    request_id: z.string().uuid().optional(),
    claim_version: z.number().int().positive().optional(),
    result_version_id: z.string().uuid().optional(),
  })
  .strict();

export type RegenClaimResult =
  | { result: "claimed"; requestId: string; claimVersion: number }
  | {
      result: "duplicate" | "duplicate_succeeded";
      requestId: string;
      claimVersion?: number;
      resultVersionId?: string;
    }
  | {
      result:
        | "not_found"
        | "repository_unavailable"
        | "stale_version"
        | "invalid_transition"
        | "usage_limit_reached";
    };

export async function claimMissionRegeneration(
  userId: string,
  taskId: string,
  sourceVersionId: string,
  feedback: string
): Promise<RegenClaimResult | { result: "database_error" }> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("claim_mission_regeneration", {
      p_user_id: userId,
      p_task_id: taskId,
      p_source_version_id: sourceVersionId,
      p_feedback: feedback,
    });
    if (error) return { result: "database_error" };
    const parsed = claimRegenSchema.safeParse(data);
    if (!parsed.success) return { result: "database_error" };
    const row = parsed.data;
    if (row.result === "claimed") {
      if (!row.request_id || !row.claim_version)
        return { result: "database_error" };
      return {
        result: "claimed",
        requestId: row.request_id,
        claimVersion: row.claim_version,
      };
    }
    if (row.result === "duplicate" || row.result === "duplicate_succeeded") {
      return {
        result: row.result,
        requestId: row.request_id ?? "",
        claimVersion: row.claim_version,
        resultVersionId: row.result_version_id,
      };
    }
    return { result: row.result };
  } catch {
    return { result: "database_error" };
  }
}

// --------------------------------------------------------------------------
// Regeneration finalize / fail
// --------------------------------------------------------------------------

export async function finalizeMissionRegeneration(input: {
  userId: string;
  taskId: string;
  requestId: string;
  claimVersion: number;
  mission: MissionOutput;
  provider: string;
  model: string | null;
  promptVersion: string;
  usageRecords: MissionUsageRecord[];
}): Promise<"finalized" | "stale" | "not_found" | "context_changed" | "database_error"> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("finalize_mission_regeneration", {
      p_user_id: input.userId,
      p_task_id: input.taskId,
      p_request_id: input.requestId,
      p_claim_version: input.claimVersion,
      p_mission: input.mission as Record<string, unknown>,
      p_provider: input.provider,
      p_model: input.model ?? "",
      p_prompt_version: input.promptVersion,
      p_usage_records: input.usageRecords as unknown[],
    });
    if (
      error ||
      !["finalized", "stale", "not_found", "context_changed"].includes(
        data as string
      )
    ) {
      return "database_error";
    }
    return data as "finalized" | "stale" | "not_found" | "context_changed";
  } catch {
    return "database_error";
  }
}

export async function failMissionRegeneration(input: {
  userId: string;
  taskId: string;
  requestId: string;
  claimVersion: number;
  errorCode: string;
  provider: string;
  usageRecords: MissionUsageRecord[];
  providerCallOccurred: boolean;
}): Promise<"failed" | "stale" | "not_found" | "database_error"> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("fail_mission_regeneration", {
      p_user_id: input.userId,
      p_task_id: input.taskId,
      p_request_id: input.requestId,
      p_claim_version: input.claimVersion,
      p_error_code: input.errorCode,
      p_provider: input.provider,
      p_usage_records: input.usageRecords as unknown[],
      p_provider_call_occurred: input.providerCallOccurred,
    });
    if (
      error ||
      !["failed", "stale", "not_found"].includes(data as string)
    ) {
      return "database_error";
    }
    return data as "failed" | "stale" | "not_found";
  } catch {
    return "database_error";
  }
}

// --------------------------------------------------------------------------
// Regeneration context (used by service to build prompt)
// --------------------------------------------------------------------------

const regenContextSchema = z
  .object({
    profile: z.object({
      experience_level: z.string(),
      timezone: z.string(),
    }),
    goal: z.object({
      title: z.string(),
      technology: z.string(),
      task_type: z.string(),
      daily_minutes: z.number(),
    }),
    repository: z.object({
      name: z.string(),
      default_branch: z.string(),
      is_private: z.boolean(),
    }),
    previous_completed_missions: z.array(
      z.object({
        title: z.string(),
        learning_outcome: z.string(),
        difficulty: z.string(),
        scheduled_date: z.string(),
      })
    ),
  })
  .strict();

export type RegenPromptContext = z.infer<typeof regenContextSchema>;

export async function getRegenerationContext(
  userId: string,
  taskId: string,
  scheduledDate: string
): Promise<RegenPromptContext | null> {
  try {
    const admin = createSupabaseAdminClient();

    const [profileResult, goalResult, repoResult, prevResult] =
      await Promise.all([
        admin
          .from("profiles")
          .select("experience_level, timezone")
          .eq("id", userId)
          .maybeSingle(),
        admin
          .from("goals")
          .select("title, technology, task_type, daily_minutes")
          .eq("user_id", userId)
          .eq("status", "active")
          .maybeSingle(),
        admin
          .from("repositories")
          .select(
            "name, default_branch, is_private, github_installations(status)"
          )
          .eq("user_id", userId)
          .eq("is_selected", true)
          .eq("access_status", "active")
          .maybeSingle(),
        admin
          .from("daily_tasks")
          .select(
            "title, learning_outcome, difficulty, scheduled_date"
          )
          .eq("user_id", userId)
          .eq("status", "completed")
          .not("completed_at", "is", null)
          .lt("scheduled_date", scheduledDate)
          .order("scheduled_date", { ascending: false })
          .limit(5),
      ]);

    if (
      profileResult.error ||
      goalResult.error ||
      repoResult.error ||
      prevResult.error
    ) {
      return null;
    }
    if (!profileResult.data || !goalResult.data || !repoResult.data) {
      return null;
    }

    const previous = (prevResult.data ?? [])
      .filter(
        (t) =>
          t.title &&
          t.learning_outcome &&
          t.difficulty &&
          t.scheduled_date
      )
      .map((t) => ({
        title: t.title as string,
        learning_outcome: t.learning_outcome as string,
        difficulty: t.difficulty as string,
        scheduled_date: t.scheduled_date,
      }));

    const ctx = {
      profile: {
        experience_level: profileResult.data.experience_level as string,
        timezone: profileResult.data.timezone as string,
      },
      goal: {
        title: goalResult.data.title,
        technology: goalResult.data.technology,
        task_type: goalResult.data.task_type,
        daily_minutes: goalResult.data.daily_minutes,
      },
      repository: {
        name: repoResult.data.name,
        default_branch: repoResult.data.default_branch,
        is_private: repoResult.data.is_private,
      },
      previous_completed_missions: previous,
    };

    const parsed = regenContextSchema.safeParse(ctx);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
