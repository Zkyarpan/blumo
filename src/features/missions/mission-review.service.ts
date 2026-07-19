import "server-only";

import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { AIProvider } from "@/lib/ai/ai-provider";
import { AIProviderError, isAIProviderError } from "@/lib/ai/ai-provider.errors";
import type { ProviderMissionRequest, ProviderMissionResult } from "@/lib/ai/ai-provider.types";
import { PollinationsProvider } from "@/lib/ai/pollinations/pollinations-provider";
import {
  buildRegenerationPrompt,
  MISSION_REGENERATION_PROMPT_VERSION,
  regenerationPromptInputSchema,
} from "./mission-regeneration-prompt";
import { validateMissionOutput } from "./mission-output.schema";
import {
  SupabaseMissionReviewRepository,
  type MissionReviewRepository,
} from "./mission-review.repository";
import type { MissionUsageRecord } from "./mission-generation.repository";
import type {
  MissionReviewModel,
  MissionApprovalResult,
  MissionRejectionResult,
  MissionRegenerationResult,
  MissionReviewErrorCode,
} from "./mission-review.types";
import {
  logSafeValidationFailure,
  summarizeZodIssues,
} from "@/lib/validation/safe-validation-diagnostics";
import { EXPERIENCE_LEVELS } from "@/features/onboarding/onboarding.schema";

const ATTEMPT_TIMEOUT_MS = 15_000;
const OPERATION_TIMEOUT_MS = 25_000;
const MAX_PROVIDER_CALLS = 2;

interface MissionReviewDependencies {
  repository: MissionReviewRepository;
  provider: AIProvider;
  nowMs: () => number;
  random: () => number;
  sleep: (ms: number) => Promise<void>;
  createCallId: () => string;
}

const defaultDependencies: MissionReviewDependencies = {
  repository: new SupabaseMissionReviewRepository(),
  provider: new PollinationsProvider(),
  nowMs: () => Date.now(),
  random: Math.random,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  createCallId: randomUUID,
};

function normalizeProviderFailure(error: unknown): AIProviderError {
  if (isAIProviderError(error)) return error;
  return new AIProviderError({ code: "unknown_provider_error", retrySafe: false });
}

async function callWithDeadline(
  provider: AIProvider,
  request: ProviderMissionRequest,
  timeoutMs: number
): Promise<ProviderMissionResult> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(
        new AIProviderError({
          code: "timed_out",
          retrySafe: true,
          providerId: provider.providerId,
        })
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      provider.generateMission(request, { signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ─── Public service functions ─────────────────────────────────────────────────

/** Load the review model for an authenticated owner. Returns null for not found/foreign. */
export async function getMissionReviewModel(
  userId: string | null,
  taskId: string,
  overrides: Partial<MissionReviewDependencies> = {}
): Promise<MissionReviewModel | null> {
  if (!userId) return null;
  const deps = { ...defaultDependencies, ...overrides };
  try {
    return await deps.repository.getReviewModel(userId, taskId);
  } catch {
    return null;
  }
}

/** Approve a mission version. Owner-validated, idempotent. */
export async function approveMission(
  userId: string | null,
  taskId: string,
  expectedVersionNumber: number,
  overrides: Partial<MissionReviewDependencies> = {}
): Promise<MissionApprovalResult> {
  if (!userId) {
    return { ok: false, code: "unauthorized" };
  }
  const deps = { ...defaultDependencies, ...overrides };
  try {
    return await deps.repository.approve(userId, taskId, expectedVersionNumber);
  } catch {
    return { ok: false, code: "database_error" };
  }
}

/** Reject a mission version with optional validated reason. */
export async function rejectMission(
  userId: string | null,
  taskId: string,
  expectedVersionNumber: number,
  reason: string | null,
  overrides: Partial<MissionReviewDependencies> = {}
): Promise<MissionRejectionResult> {
  if (!userId) {
    return { ok: false, code: "unauthorized" };
  }
  const deps = { ...defaultDependencies, ...overrides };
  try {
    return await deps.repository.reject(userId, taskId, expectedVersionNumber, reason);
  } catch {
    return { ok: false, code: "database_error" };
  }
}

/** Claim and execute bounded regeneration for a rejected mission. */
export async function regenerateMission(
  userId: string | null,
  taskId: string,
  sourceVersionNumber: number,
  feedback: string,
  overrides: Partial<MissionReviewDependencies> = {}
): Promise<MissionRegenerationResult> {
  if (!userId) {
    return { ok: false, code: "unauthorized" };
  }
  const deps = { ...defaultDependencies, ...overrides };
  const { repository, provider } = deps;

  // Validate provider configuration before claiming
  try {
    provider.validateConfiguration();
  } catch (error: unknown) {
    const providerError = normalizeProviderFailure(error);
    if (!isAIProviderError(error)) {
      logSafeValidationFailure({
        stage: "provider_configuration",
        failedFields: ["provider"],
        issueCodes: ["custom"],
        category: "regeneration_configuration_validation_failed",
      });
    }
    return { ok: false, code: providerError.code };
  }

  let claim;
  try {
    claim = await repository.claimRegeneration(
      userId,
      taskId,
      sourceVersionNumber,
      feedback
    );
  } catch {
    return { ok: false, code: "database_error" };
  }

  if (claim.result === "processing") {
    return { ok: true, code: "processing" };
  }
  if (claim.result === "already_succeeded") {
    return { ok: true, code: "already_succeeded" };
  }
  if (claim.result !== "claimed") {
    return { ok: false, code: claim.result as MissionReviewErrorCode };
  }

  const { requestId, claimVersion, context } = claim;

  // Build regeneration prompt from validated context
  let prompt;
  try {
    const promptInput = regenerationPromptInputSchema.parse({
      learningGoal: {
        title: context.goal.title,
        technology: context.goal.technology,
        taskType: context.goal.task_type,
        dailyMinutes: context.goal.daily_minutes,
      },
      repository: {
        name: context.repository.name,
        defaultBranch: context.repository.default_branch,
        isPrivate: context.repository.is_private,
      },
      previousCompletedMissions: context.previous_completed_missions,
      experienceLevel: context.profile.experience_level as typeof EXPERIENCE_LEVELS[number],
      rejectedVersion: {
        version_number: context.rejected_version.version_number,
        title: context.rejected_version.title,
        description: context.rejected_version.description,
        difficulty: context.rejected_version.difficulty as typeof EXPERIENCE_LEVELS[number],
        estimated_minutes: context.rejected_version.estimated_minutes,
        acceptance_checklist: Array.isArray(context.rejected_version.acceptance_checklist)
          ? context.rejected_version.acceptance_checklist
          : [],
        suggested_commit_message: context.rejected_version.suggested_commit_message,
        learning_outcome: context.rejected_version.learning_outcome,
      },
      feedback: context.feedback,
    });
    prompt = buildRegenerationPrompt(promptInput);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      logSafeValidationFailure({
        stage: "prompt_input",
        ...summarizeZodIssues(error.issues),
        category: "invalid_regeneration_prompt_context",
      });
    } else {
      logSafeValidationFailure({
        stage: "prompt_input",
        failedFields: ["regeneration_context"],
        issueCodes: ["custom"],
        category: "regeneration_prompt_construction_failed",
      });
    }
    await safelyFailRegeneration(repository, {
      userId,
      taskId,
      requestId,
      claimVersion,
      errorCode: "invalid_response",
      provider: provider.providerId,
      usageRecords: [],
      incrementProviderAttempts: false,
    });
    return { ok: false, code: "invalid_response" };
  }

  const providerRequest: ProviderMissionRequest = {
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    responseSchemaVersion: prompt.version,
    temperature: 0.3,
    maxOutputTokens: 1_500,
  };

  const usageRecords: MissionUsageRecord[] = [];
  const operationStartedAt = deps.nowMs();
  let finalProviderResult: ProviderMissionResult | null = null;

  for (let callIndex = 0; callIndex < MAX_PROVIDER_CALLS; callIndex += 1) {
    const remaining = OPERATION_TIMEOUT_MS - (deps.nowMs() - operationStartedAt);
    if (remaining <= 0) {
      await safelyFailRegeneration(repository, {
        userId, taskId, requestId, claimVersion,
        errorCode: "timed_out",
        provider: provider.providerId,
        usageRecords,
        incrementProviderAttempts: true,
      });
      return { ok: false, code: "timed_out" };
    }
    const providerCallId = deps.createCallId();
    try {
      const result = await callWithDeadline(
        provider,
        providerRequest,
        Math.min(ATTEMPT_TIMEOUT_MS, remaining)
      );
      finalProviderResult = result;
      usageRecords.push({
        provider_call_id: providerCallId,
        model: result.modelId,
        input_units: result.usage.inputUnits,
        output_units: result.usage.outputUnits,
        success: false,
      });
      break;
    } catch (error: unknown) {
      const providerError = normalizeProviderFailure(error);
      if (providerError.code !== "configuration_error") {
        usageRecords.push({
          provider_call_id: providerCallId,
          model: providerError.modelId,
          input_units: null,
          output_units: null,
          success: false,
        });
      }
      const mayRetry = providerError.retrySafe && callIndex === 0;
      if (!mayRetry) {
        await safelyFailRegeneration(repository, {
          userId, taskId, requestId, claimVersion,
          errorCode: providerError.code,
          provider: provider.providerId,
          usageRecords,
          incrementProviderAttempts: true,
        });
        return { ok: false, code: providerError.code };
      }
      const delay =
        providerError.retryAfterMs !== null && providerError.retryAfterMs <= 2_000
          ? providerError.retryAfterMs
          : Math.round(250 + deps.random() * 500);
      const elapsed = deps.nowMs() - operationStartedAt;
      if (elapsed + delay + ATTEMPT_TIMEOUT_MS > OPERATION_TIMEOUT_MS) {
        await safelyFailRegeneration(repository, {
          userId, taskId, requestId, claimVersion,
          errorCode: providerError.code,
          provider: provider.providerId,
          usageRecords,
          incrementProviderAttempts: true,
        });
        return { ok: false, code: providerError.code };
      }
      await deps.sleep(delay);
    }
  }

  if (!finalProviderResult) {
    await safelyFailRegeneration(repository, {
      userId, taskId, requestId, claimVersion,
      errorCode: "unknown_provider_error",
      provider: provider.providerId,
      usageRecords,
      incrementProviderAttempts: true,
    });
    return { ok: false, code: "unknown_provider_error" };
  }

  const validation = validateMissionOutput(finalProviderResult.content, {
    dailyMinutes: context.goal.daily_minutes as 10 | 20 | 30 | 45 | 60,
    experienceLevel: context.profile.experience_level as typeof EXPERIENCE_LEVELS[number],
    defaultBranch: context.repository.default_branch,
  });

  if (!validation.ok) {
    await safelyFailRegeneration(repository, {
      userId, taskId, requestId, claimVersion,
      errorCode: validation.code,
      provider: provider.providerId,
      usageRecords,
      incrementProviderAttempts: true,
    });
    return { ok: false, code: validation.code };
  }

  usageRecords[usageRecords.length - 1].success = true;

  try {
    const finalizeResult = await repository.finalizeRegeneration({
      userId,
      taskId,
      requestId,
      claimVersion,
      mission: validation.mission,
      provider: finalProviderResult.providerId,
      model: finalProviderResult.modelId,
      promptVersion: MISSION_REGENERATION_PROMPT_VERSION,
      usageRecords,
    });

    if (finalizeResult === "finalized") {
      return { ok: true, code: "claimed" };
    }

    await safelyFailRegeneration(repository, {
      userId, taskId, requestId, claimVersion,
      errorCode: "context_changed",
      provider: provider.providerId,
      usageRecords,
      incrementProviderAttempts: false,
    });
    return { ok: false, code: "context_changed" };
  } catch {
    logSafeValidationFailure({
      stage: "mission_persistence",
      failedFields: ["mission_versions"],
      issueCodes: ["custom"],
      category: "regeneration_finalize_failed",
    });
    return { ok: false, code: "database_error" };
  }
}

async function safelyFailRegeneration(
  repository: MissionReviewRepository,
  input: {
    userId: string;
    taskId: string;
    requestId: string;
    claimVersion: number;
    errorCode: string;
    provider: string;
    usageRecords: MissionUsageRecord[];
    incrementProviderAttempts: boolean;
  }
): Promise<void> {
  try {
    await repository.failRegeneration({
      ...input,
      promptVersion: MISSION_REGENERATION_PROMPT_VERSION,
    });
  } catch {
    // Best-effort — do not throw
  }
}
