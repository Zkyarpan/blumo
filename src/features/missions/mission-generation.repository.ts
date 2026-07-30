import "server-only";

import { z } from "zod";
import {
  EXPERIENCE_LEVELS,
  TASK_TYPES,
} from "@/features/onboarding/onboarding.schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  logSafeValidationFailure,
  summarizeZodIssues,
} from "@/lib/validation/safe-validation-diagnostics";
import {
  missionOutputSchema,
  type MissionOutput,
} from "./mission-output.schema";
import type { MissionPromptContext } from "./mission-generation.types";

const promptContextSchema = z
  .object({
    profile: z
      .object({
        experience_level: z.enum(EXPERIENCE_LEVELS),
        timezone: z.string().min(1).max(60),
      })
      .strict(),
    goal: z
      .object({
        title: z.string().trim().min(5).max(200),
        technology: z.string().trim().min(1).max(80),
        task_type: z.enum(TASK_TYPES),
        daily_minutes: z.union([
          z.literal(10),
          z.literal(20),
          z.literal(30),
          z.literal(45),
          z.literal(60),
        ]),
      })
      .strict(),
    repository: z
      .object({
        name: z.string().trim().min(1).max(100),
        default_branch: z.string().trim().min(1).max(255),
        is_private: z.boolean(),
      })
      .strict(),
    previous_completed_missions: z
      .array(
        z
          .object({
            title: z.string().trim().min(5).max(100),
            learning_outcome: z.string().trim().min(10).max(300),
            difficulty: z.enum(EXPERIENCE_LEVELS),
            scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
          .strict()
      )
      .max(5),
    scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

const claimRowSchema = z
  .object({
    claim_result: z.enum([
      "claimed",
      "retry_claimed",
      "in_progress",
      "existing",
      "retry_exhausted",
      "retry_not_allowed",
      "not_onboarded",
      "no_active_goal",
      "no_active_repository",
      "context_changed",
    ]),
    task_id: z.string().uuid().nullable(),
    claim_version: z.number().int().positive().nullable(),
    prompt_context: z.unknown().nullable(),
  })
  .strict();

const profileTimezoneSchema = z
  .object({
    timezone: z.string().trim().min(1).max(60),
  })
  .strict();

export interface MissionUsageRecord {
  provider_call_id: string;
  model: string | null;
  input_units: number | null;
  output_units: number | null;
  success: boolean;
}

export class MissionClaimValidationError extends Error {
  readonly taskId: string;
  readonly claimVersion: number;

  constructor(taskId: string, claimVersion: number) {
    super("mission_claim_validation_failed");
    this.name = "MissionClaimValidationError";
    this.taskId = taskId;
    this.claimVersion = claimVersion;
  }
}

export type TodayMissionState =
  | { kind: "none" }
  | { kind: "generating"; taskId: string; generationAttempts: number }
  | {
      kind: "failed";
      taskId: string;
      generationAttempts: number;
      errorCode: string | null;
      canRetry: boolean;
    }
  | { kind: "invalid" }
  | {
      kind: "ready";
      taskId: string;
      repositoryName: string;
      mission: MissionOutput;
    };

const RETRYABLE_FAILURE_CODES = new Set([
  "timed_out",
  "rate_limited",
  "temporarily_unavailable",
  "invalid_response",
  "unsafe_response",
  "unknown_provider_error",
]);

/** Reads only the authenticated owner's mission through the RLS client. */
function mapOwnedMissionRow(data: Record<string, unknown>): TodayMissionState {
  const taskId = typeof data.id === "string" ? data.id : null;
  const generationAttempts =
    typeof data.provider_generation_attempts === "number"
      ? data.provider_generation_attempts
      : 0;
  if (!taskId) return { kind: "invalid" };

  if (data.status === "generating") {
    return { kind: "generating", taskId, generationAttempts };
  }
  if (data.status === "failed") {
    const errorCode =
      typeof data.generation_error_code === "string"
        ? data.generation_error_code
        : null;
    return {
      kind: "failed",
      taskId,
      generationAttempts,
      errorCode,
      canRetry:
        generationAttempts < 3 &&
        errorCode !== null &&
        RETRYABLE_FAILURE_CODES.has(errorCode),
    };
  }
  // Rejected mission: show as review-pending so dashboard can link to review
  if (data.status === "rejected") {
    const mission = missionOutputSchema.safeParse({
      title: data.title,
      description: data.summary,
      estimated_minutes: data.estimated_minutes,
      difficulty: data.difficulty,
      acceptance_checklist: data.acceptance_checklist,
      suggested_commit_message: data.suggested_commit_message,
      suggested_branch: data.suggested_branch,
      learning_outcome: data.learning_outcome,
    });
    if (!mission.success) return { kind: "invalid" };
    const repositoryRelation = data.repositories as
      | { name?: unknown }
      | { name?: unknown }[]
      | null;
    const repository = Array.isArray(repositoryRelation)
      ? repositoryRelation[0]
      : repositoryRelation;
    const repositoryName =
      repository && typeof repository.name === "string"
        ? repository.name
        : "Selected repository";
    return { kind: "ready", taskId, repositoryName, mission: mission.data };
  }
  // Approved mission: show as approved state on dashboard
  if (data.status === "approved") {
    const mission = missionOutputSchema.safeParse({
      title: data.title,
      description: data.summary,
      estimated_minutes: data.estimated_minutes,
      difficulty: data.difficulty,
      acceptance_checklist: data.acceptance_checklist,
      suggested_commit_message: data.suggested_commit_message,
      suggested_branch: data.suggested_branch,
      learning_outcome: data.learning_outcome,
    });
    if (!mission.success) return { kind: "invalid" };
    const repositoryRelation = data.repositories as
      | { name?: unknown }
      | { name?: unknown }[]
      | null;
    const repository = Array.isArray(repositoryRelation)
      ? repositoryRelation[0]
      : repositoryRelation;
    const repositoryName =
      repository && typeof repository.name === "string"
        ? repository.name
        : "Selected repository";
    return { kind: "ready", taskId, repositoryName, mission: mission.data };
  }

  const mission = missionOutputSchema.safeParse({
    title: data.title,
    description: data.summary,
    estimated_minutes: data.estimated_minutes,
    difficulty: data.difficulty,
    acceptance_checklist: data.acceptance_checklist,
    suggested_commit_message: data.suggested_commit_message,
    suggested_branch: data.suggested_branch,
    learning_outcome: data.learning_outcome,
  });

  if (!mission.success) return { kind: "invalid" };
  const repositoryRelation = data.repositories as
    | { name?: unknown }
    | { name?: unknown }[]
    | null;
  const repository = Array.isArray(repositoryRelation)
    ? repositoryRelation[0]
    : repositoryRelation;
  const repositoryName =
    repository && typeof repository.name === "string"
      ? repository.name
      : "Selected repository";

  return {
    kind: "ready",
    taskId,
    repositoryName,
    mission: mission.data,
  };
}

const OWNED_MISSION_SELECT =
  "id, scheduled_date, title, summary, estimated_minutes, difficulty, acceptance_checklist, suggested_commit_message, suggested_branch, learning_outcome, status, review_operation_status, current_mission_version_id, provider_generation_attempts, generation_error_code, repositories(name)";

export async function getOwnedTodayMission(
  userId: string,
  scheduledDate: string
): Promise<TodayMissionState> {
  const client = await createSupabaseServerClient();
  const { data: todayData, error: todayError } = await client
    .from("daily_tasks")
    .select(OWNED_MISSION_SELECT)
    .eq("user_id", userId)
    .eq("scheduled_date", scheduledDate)
    .maybeSingle();

  if (todayError) throw new Error("today_mission_query_failed");

  // Today's row exists and is not failed — show it directly.
  if (todayData && todayData.status !== "failed") {
    return mapOwnedMissionRow(todayData as Record<string, unknown>);
  }

  // A valid mission from an earlier date remains the user's one active mission.
  const { data: activeData, error: activeError } = await client
    .from("daily_tasks")
    .select(OWNED_MISSION_SELECT)
    .eq("user_id", userId)
    .in("status", ["generating", "generated", "approved", "in_progress"])
    .order("scheduled_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) throw new Error("active_mission_query_failed");
  if (activeData) {
    return mapOwnedMissionRow(activeData as Record<string, unknown>);
  }

  // Only show a failed row if it is actually from today — never show a stale
  // failure from a previous date as the current state.
  if (todayData && todayData.scheduled_date === scheduledDate) {
    return mapOwnedMissionRow(todayData as Record<string, unknown>);
  }

  return { kind: "none" };
}

export type MissionClaim =
  | {
      result: "claimed" | "retry_claimed";
      taskId: string;
      claimVersion: number;
      context: MissionPromptContext;
    }
  | {
      result:
        | "in_progress"
        | "existing"
        | "retry_exhausted"
        | "retry_not_allowed"
        | "not_onboarded"
        | "no_active_goal"
        | "no_active_repository"
        | "context_changed";
      taskId: string | null;
      claimVersion: number | null;
    };

export interface MissionGenerationRepository {
  getUserTimezone(userId: string): Promise<string | null>;
  claim(userId: string, scheduledDate: string): Promise<MissionClaim>;
  finalize(input: {
    userId: string;
    taskId: string;
    claimVersion: number;
    mission: MissionOutput;
    provider: string;
    model: string | null;
    promptVersion: string;
    usageRecords: MissionUsageRecord[];
  }): Promise<"finalized" | "stale" | "context_changed">;
  fail(input: {
    userId: string;
    taskId: string;
    claimVersion: number;
    errorCode: string;
    provider: string;
    promptVersion: string;
    usageRecords: MissionUsageRecord[];
  }): Promise<boolean>;
}

export class SupabaseMissionGenerationRepository
  implements MissionGenerationRepository
{
  async getUserTimezone(userId: string): Promise<string | null> {
    const client = createSupabaseAdminClient();
    const { data, error } = await client
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error("mission_timezone_query_failed");
    if (!data) return null;

    const profile = profileTimezoneSchema.safeParse(data);
    if (!profile.success) {
      logSafeValidationFailure({
        stage: "profile_context",
        ...summarizeZodIssues(profile.error.issues),
        category: "invalid_stored_profile",
      });
      throw new Error("mission_profile_invalid");
    }
    return profile.data.timezone;
  }

  async claim(userId: string, scheduledDate: string): Promise<MissionClaim> {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("claim_daily_mission_generation", {
      p_user_id: userId,
      p_scheduled_date: scheduledDate,
    });

    if (error) throw new Error("mission_claim_failed");
    const rawRow = Array.isArray(data) ? data[0] : data;
    const row = claimRowSchema.safeParse(rawRow);
    if (!row.success) {
      logSafeValidationFailure({
        stage: "claim_result",
        ...summarizeZodIssues(row.error.issues),
        category: "invalid_database_claim_result",
      });
      throw new Error("mission_claim_invalid_result");
    }

    if (row.data.claim_result === "claimed" || row.data.claim_result === "retry_claimed") {
      if (!row.data.task_id || !row.data.claim_version) {
        throw new Error("mission_claim_missing_identity");
      }
      const context = promptContextSchema.safeParse(row.data.prompt_context);
      if (!context.success) {
        logSafeValidationFailure({
          stage: "claim_context",
          ...summarizeZodIssues(context.error.issues),
          category: "invalid_stored_mission_context",
        });
        throw new MissionClaimValidationError(
          row.data.task_id,
          row.data.claim_version
        );
      }
      return {
        result: row.data.claim_result,
        taskId: row.data.task_id,
        claimVersion: row.data.claim_version,
        context: context.data,
      };
    }

    return {
      result: row.data.claim_result,
      taskId: row.data.task_id,
      claimVersion: row.data.claim_version,
    };
  }

  async finalize(input: {
    userId: string;
    taskId: string;
    claimVersion: number;
    mission: MissionOutput;
    provider: string;
    model: string | null;
    promptVersion: string;
    usageRecords: MissionUsageRecord[];
  }): Promise<"finalized" | "stale" | "context_changed"> {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("finalize_daily_mission_generation", {
      p_user_id: input.userId,
      p_task_id: input.taskId,
      p_claim_version: input.claimVersion,
      p_mission: input.mission,
      p_provider: input.provider,
      p_model: input.model ?? "",
      p_prompt_version: input.promptVersion,
      p_usage_records: input.usageRecords,
    });

    if (error || (data !== "finalized" && data !== "stale" && data !== "context_changed")) {
      throw new Error("mission_finalize_failed");
    }
    return data;
  }

  async fail(input: {
    userId: string;
    taskId: string;
    claimVersion: number;
    errorCode: string;
    provider: string;
    promptVersion: string;
    usageRecords: MissionUsageRecord[];
  }): Promise<boolean> {
    const client = createSupabaseAdminClient();
    const { data, error } = await client.rpc("fail_daily_mission_generation", {
      p_user_id: input.userId,
      p_task_id: input.taskId,
      p_claim_version: input.claimVersion,
      p_error_code: input.errorCode,
      p_provider: input.provider,
      p_prompt_version: input.promptVersion,
      p_usage_records: input.usageRecords,
    });

    if (error || typeof data !== "boolean") {
      throw new Error("mission_failure_write_failed");
    }
    return data;
  }
}

export { promptContextSchema };
