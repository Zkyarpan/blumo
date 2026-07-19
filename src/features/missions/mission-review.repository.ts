import "server-only";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { missionOutputSchema } from "./mission-output.schema";
import type {
  MissionReviewModel,
  MissionApprovalResult,
  MissionRejectionResult,
} from "./mission-review.types";
import type { MissionUsageRecord } from "./mission-generation.repository";
import type { MissionOutput } from "./mission-output.schema";
import { logSafeValidationFailure, summarizeZodIssues } from "@/lib/validation/safe-validation-diagnostics";

// ─── RLS read schemas ─────────────────────────────────────────────────────────

const reviewTaskRowSchema = z
  .object({
    id: z.string().uuid(),
    scheduled_date: z.string(),
    status: z.enum(["generated", "approved", "rejected", "in_progress", "completed"]),
    review_operation_status: z.enum(["idle", "regenerating"]),
    current_mission_version_id: z.string().uuid().nullable(),
    approved_at: z.string().nullable(),
    rejected_at: z.string().nullable(),
    regeneration_count: z.number().int().min(0).max(2),
    title: z.string().nullable(),
    summary: z.string().nullable(),
    estimated_minutes: z.number().nullable(),
    difficulty: z.string().nullable(),
    acceptance_checklist: z.unknown().nullable(),
    suggested_commit_message: z.string().nullable(),
    suggested_branch: z.string().nullable(),
    learning_outcome: z.string().nullable(),
    repositories: z
      .union([
        z.object({
          full_name: z.string(),
          is_selected: z.boolean(),
          access_status: z.string(),
        }),
        z.array(
          z.object({
            full_name: z.string(),
            is_selected: z.boolean(),
            access_status: z.string(),
          })
        ),
      ])
      .nullable(),
  })
  .strict();

const reviewVersionRowSchema = z
  .object({
    id: z.string().uuid(),
    version_number: z.number().int().positive(),
    status: z.enum(["generated", "approved", "rejected"]),
    rejection_reason: z.string().nullable(),
    created_at: z.string(),
  })
  .strict();

// ─── RPC result schemas ───────────────────────────────────────────────────────

const APPROVAL_RESULTS = [
  "approved",
  "already_approved",
  "not_found",
  "repository_unavailable",
  "stale_version",
  "invalid_transition",
] as const;

const REJECTION_RESULTS = [
  "rejected",
  "already_rejected",
  "not_found",
  "stale_version",
  "invalid_transition",
] as const;

const REGENERATION_CLAIM_RESULTS = [
  "claimed",
  "processing",
  "already_succeeded",
  "not_found",
  "invalid_transition",
  "stale_version",
  "repository_unavailable",
  "usage_limit_reached",
  "context_changed",
] as const;

// ─── Query constants ──────────────────────────────────────────────────────────

const REVIEW_TASK_SELECT = [
  "id",
  "scheduled_date",
  "status",
  "review_operation_status",
  "current_mission_version_id",
  "approved_at",
  "rejected_at",
  "regeneration_count",
  "title",
  "summary",
  "estimated_minutes",
  "difficulty",
  "acceptance_checklist",
  "suggested_commit_message",
  "suggested_branch",
  "learning_outcome",
  "repositories(full_name, is_selected, access_status)",
].join(", ");

const REVIEW_VERSION_SELECT = "id, version_number, status, rejection_reason, created_at";

// ─── Repository interface ─────────────────────────────────────────────────────

export interface MissionReviewRepository {
  getReviewModel(userId: string, taskId: string): Promise<MissionReviewModel | null>;
  approve(
    userId: string,
    taskId: string,
    expectedVersionNumber: number
  ): Promise<MissionApprovalResult>;
  reject(
    userId: string,
    taskId: string,
    expectedVersionNumber: number,
    reason: string | null
  ): Promise<MissionRejectionResult>;
  claimRegeneration(
    userId: string,
    taskId: string,
    sourceVersionNumber: number,
    feedback: string
  ): Promise<MissionRegenerationClaimResult>;
  finalizeRegeneration(input: {
    userId: string;
    taskId: string;
    requestId: string;
    claimVersion: number;
    mission: MissionOutput;
    provider: string;
    model: string | null;
    promptVersion: string;
    usageRecords: MissionUsageRecord[];
  }): Promise<"finalized" | "stale" | "context_changed">;
  failRegeneration(input: {
    userId: string;
    taskId: string;
    requestId: string;
    claimVersion: number;
    errorCode: string;
    provider: string;
    promptVersion: string;
    usageRecords: MissionUsageRecord[];
    incrementProviderAttempts: boolean;
  }): Promise<boolean>;
}

export type MissionRegenerationClaimResult =
  | {
      result: "claimed" | "processing" | "already_succeeded";
      requestId: string;
      claimVersion: number;
      sourceVersionId: string;
      context: RegenerationPromptContext;
    }
  | {
      result:
        | "not_found"
        | "invalid_transition"
        | "stale_version"
        | "repository_unavailable"
        | "usage_limit_reached"
        | "context_changed";
    };

export interface RegenerationPromptContext {
  profile: { experience_level: string; timezone: string };
  goal: {
    title: string;
    technology: string;
    task_type: string;
    daily_minutes: number;
  };
  repository: {
    name: string;
    default_branch: string;
    is_private: boolean;
  };
  previous_completed_missions: Array<{
    title: string;
    learning_outcome: string;
    difficulty: string;
    scheduled_date: string;
  }>;
  scheduled_date: string;
  rejected_version: {
    version_number: number;
    title: string;
    description: string;
    difficulty: string;
    estimated_minutes: number;
    acceptance_checklist: unknown;
    suggested_commit_message: string;
    learning_outcome: string;
  };
  feedback: string;
}

const regenerationClaimRowSchema = z
  .object({
    claim_result: z.enum(REGENERATION_CLAIM_RESULTS),
    request_id: z.string().uuid().nullable(),
    claim_version: z.number().int().positive().nullable(),
    source_version_id: z.string().uuid().nullable(),
    prompt_context: z.unknown().nullable(),
  })
  .strict();

// ─── Implementation ───────────────────────────────────────────────────────────

function mapTaskRowToReviewModel(
  task: z.infer<typeof reviewTaskRowSchema>,
  version: z.infer<typeof reviewVersionRowSchema>
): MissionReviewModel | null {
  const missionParsed = missionOutputSchema.safeParse({
    title: task.title,
    description: task.summary,
    estimated_minutes: task.estimated_minutes,
    difficulty: task.difficulty,
    acceptance_checklist: task.acceptance_checklist,
    suggested_commit_message: task.suggested_commit_message,
    suggested_branch: task.suggested_branch,
    learning_outcome: task.learning_outcome,
  });

  if (!missionParsed.success) {
    logSafeValidationFailure({
      stage: "mission_output_schema",
      ...summarizeZodIssues(missionParsed.error.issues),
      category: "review_mission_invalid",
    });
    return null;
  }

  const repoRelation = Array.isArray(task.repositories)
    ? task.repositories[0]
    : task.repositories;
  const repository = repoRelation
    ? {
        fullName: repoRelation.full_name,
        isAvailable:
          repoRelation.is_selected && repoRelation.access_status === "active",
      }
    : null;

  return {
    taskId: task.id,
    scheduledDate: task.scheduled_date,
    status: task.status,
    reviewOperationStatus: task.review_operation_status,
    currentVersionNumber: version.version_number,
    currentVersionId: version.id,
    versionCreatedAt: version.created_at,
    regenerationCount: task.regeneration_count,
    mission: missionParsed.data,
    approvedAt: task.approved_at,
    rejectedAt: task.rejected_at,
    rejectionReason: version.rejection_reason,
    repository,
  };
}

export class SupabaseMissionReviewRepository implements MissionReviewRepository {
  async getReviewModel(
    userId: string,
    taskId: string
  ): Promise<MissionReviewModel | null> {
    const client = await createSupabaseServerClient();

    const { data, error } = await client
      .from("daily_tasks")
      .select(REVIEW_TASK_SELECT)
      .eq("id", taskId)
      .eq("user_id", userId)
      .in("status", ["generated", "approved", "rejected", "in_progress", "completed"])
      .maybeSingle();

    if (error) {
      throw new Error("review_task_query_failed");
    }
    if (!data) {
      return null;
    }

    const taskParsed = reviewTaskRowSchema.safeParse(data);
    if (!taskParsed.success) {
      logSafeValidationFailure({
        stage: "mission_output_schema",
        ...summarizeZodIssues(taskParsed.error.issues),
        category: "review_task_row_invalid",
      });
      return null;
    }

    const task = taskParsed.data;
    if (!task.current_mission_version_id) {
      return null;
    }

    const { data: versionData, error: versionError } = await client
      .from("mission_versions")
      .select(REVIEW_VERSION_SELECT)
      .eq("id", task.current_mission_version_id)
      .eq("task_id", taskId)
      .eq("user_id", userId)
      .maybeSingle();

    if (versionError) {
      throw new Error("review_version_query_failed");
    }
    if (!versionData) {
      return null;
    }

    const versionParsed = reviewVersionRowSchema.safeParse(versionData);
    if (!versionParsed.success) {
      logSafeValidationFailure({
        stage: "mission_output_schema",
        ...summarizeZodIssues(versionParsed.error.issues),
        category: "review_version_row_invalid",
      });
      return null;
    }

    return mapTaskRowToReviewModel(task, versionParsed.data);
  }

  async approve(
    userId: string,
    taskId: string,
    expectedVersionNumber: number
  ): Promise<MissionApprovalResult> {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("approve_mission_version", {
      p_user_id: userId,
      p_task_id: taskId,
      p_expected_version_number: expectedVersionNumber,
    });

    if (error) {
      throw new Error("approve_rpc_failed");
    }

    if (!APPROVAL_RESULTS.includes(data as (typeof APPROVAL_RESULTS)[number])) {
      throw new Error("approve_rpc_invalid_result");
    }

    const result = data as (typeof APPROVAL_RESULTS)[number];
    if (result === "approved" || result === "already_approved") {
      return { ok: true, code: result };
    }
    return { ok: false, code: result };
  }

  async reject(
    userId: string,
    taskId: string,
    expectedVersionNumber: number,
    reason: string | null
  ): Promise<MissionRejectionResult> {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("reject_mission_version", {
      p_user_id: userId,
      p_task_id: taskId,
      p_expected_version_number: expectedVersionNumber,
      p_rejection_reason: reason ?? "",
    });

    if (error) {
      throw new Error("reject_rpc_failed");
    }

    if (!REJECTION_RESULTS.includes(data as (typeof REJECTION_RESULTS)[number])) {
      throw new Error("reject_rpc_invalid_result");
    }

    const result = data as (typeof REJECTION_RESULTS)[number];
    if (result === "rejected" || result === "already_rejected") {
      return { ok: true, code: result };
    }
    return { ok: false, code: result };
  }

  async claimRegeneration(
    userId: string,
    taskId: string,
    sourceVersionNumber: number,
    feedback: string
  ): Promise<MissionRegenerationClaimResult> {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("claim_mission_regeneration", {
      p_user_id: userId,
      p_task_id: taskId,
      p_source_version_number: sourceVersionNumber,
      p_feedback: feedback,
    });

    if (error) {
      throw new Error("regeneration_claim_rpc_failed");
    }

    const rawRow = Array.isArray(data) ? data[0] : data;
    const row = regenerationClaimRowSchema.safeParse(rawRow);
    if (!row.success) {
      logSafeValidationFailure({
        stage: "claim_result",
        ...summarizeZodIssues(row.error.issues),
        category: "invalid_regeneration_claim_result",
      });
      throw new Error("regeneration_claim_invalid_result");
    }

    const claimResult = row.data.claim_result;

    if (
      claimResult === "not_found" ||
      claimResult === "invalid_transition" ||
      claimResult === "stale_version" ||
      claimResult === "repository_unavailable" ||
      claimResult === "usage_limit_reached" ||
      claimResult === "context_changed"
    ) {
      return { result: claimResult };
    }

    if (!row.data.request_id || !row.data.claim_version || !row.data.source_version_id) {
      throw new Error("regeneration_claim_missing_identity");
    }

    // For processing/already_succeeded, no prompt context is needed
    if (claimResult === "processing" || claimResult === "already_succeeded") {
      return {
        result: claimResult,
        requestId: row.data.request_id,
        claimVersion: row.data.claim_version,
        sourceVersionId: row.data.source_version_id,
        context: null as unknown as RegenerationPromptContext,
      };
    }

    // claimed — validate context
    const contextSchema = z
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
        previous_completed_missions: z.array(z.object({
          title: z.string(),
          learning_outcome: z.string(),
          difficulty: z.string(),
          scheduled_date: z.string(),
        })),
        scheduled_date: z.string(),
        rejected_version: z.object({
          version_number: z.number(),
          title: z.string(),
          description: z.string(),
          difficulty: z.string(),
          estimated_minutes: z.number(),
          acceptance_checklist: z.unknown(),
          suggested_commit_message: z.string(),
          learning_outcome: z.string(),
        }),
        feedback: z.string(),
      })
      .passthrough();

    const context = contextSchema.safeParse(row.data.prompt_context);
    if (!context.success) {
      logSafeValidationFailure({
        stage: "claim_context",
        ...summarizeZodIssues(context.error.issues),
        category: "invalid_regeneration_context",
      });
      throw new Error("regeneration_claim_invalid_context");
    }

    return {
      result: "claimed",
      requestId: row.data.request_id,
      claimVersion: row.data.claim_version,
      sourceVersionId: row.data.source_version_id,
      context: context.data as RegenerationPromptContext,
    };
  }

  async finalizeRegeneration(input: {
    userId: string;
    taskId: string;
    requestId: string;
    claimVersion: number;
    mission: MissionOutput;
    provider: string;
    model: string | null;
    promptVersion: string;
    usageRecords: MissionUsageRecord[];
  }): Promise<"finalized" | "stale" | "context_changed"> {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("finalize_mission_regeneration", {
      p_user_id: input.userId,
      p_task_id: input.taskId,
      p_request_id: input.requestId,
      p_claim_version: input.claimVersion,
      p_mission: input.mission,
      p_provider: input.provider,
      p_model: input.model ?? "",
      p_prompt_version: input.promptVersion,
      p_usage_records: input.usageRecords,
    });

    if (
      error ||
      (data !== "finalized" && data !== "stale" && data !== "context_changed")
    ) {
      throw new Error("regeneration_finalize_failed");
    }
    return data;
  }

  async failRegeneration(input: {
    userId: string;
    taskId: string;
    requestId: string;
    claimVersion: number;
    errorCode: string;
    provider: string;
    promptVersion: string;
    usageRecords: MissionUsageRecord[];
    incrementProviderAttempts: boolean;
  }): Promise<boolean> {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("fail_mission_regeneration", {
      p_user_id: input.userId,
      p_task_id: input.taskId,
      p_request_id: input.requestId,
      p_claim_version: input.claimVersion,
      p_error_code: input.errorCode,
      p_provider: input.provider,
      p_prompt_version: input.promptVersion,
      p_usage_records: input.usageRecords,
      p_increment_provider_attempts: input.incrementProviderAttempts,
    });

    if (error || typeof data !== "boolean") {
      throw new Error("regeneration_failure_write_failed");
    }
    return data;
  }
}
