import "server-only";

import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { AIProvider } from "@/lib/ai/ai-provider";
import {
  AIProviderError,
  isAIProviderError,
} from "@/lib/ai/ai-provider.errors";
import type {
  ProviderMissionRequest,
  ProviderMissionResult,
} from "@/lib/ai/ai-provider.types";
import { PollinationsProvider } from "@/lib/ai/pollinations/pollinations-provider";
import {
  buildMissionPrompt,
  MISSION_PROMPT_VERSION,
} from "./mission-prompt";
import { validateMissionOutput } from "./mission-output.schema";
import {
  SupabaseMissionGenerationRepository,
  MissionClaimValidationError,
  type MissionGenerationRepository,
  type MissionUsageRecord,
} from "./mission-generation.repository";
import type {
  MissionErrorCode,
  MissionGenerationResult,
} from "./mission-generation.types";
import { getUserLocalDate } from "./mission-date";
import {
  logSafeValidationFailure,
  summarizeZodIssues,
} from "@/lib/validation/safe-validation-diagnostics";

const ATTEMPT_TIMEOUT_MS = 15_000;
const OPERATION_TIMEOUT_MS = 25_000;
const MAX_PROVIDER_CALLS = 2;

interface MissionGenerationDependencies {
  repository: MissionGenerationRepository;
  provider: AIProvider;
  now: () => Date;
  nowMs: () => number;
  random: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  createCallId: () => string;
  signal?: AbortSignal;
}

const defaultDependencies: MissionGenerationDependencies = {
  repository: new SupabaseMissionGenerationRepository(),
  provider: new PollinationsProvider(),
  now: () => new Date(),
  nowMs: () => Date.now(),
  random: Math.random,
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  createCallId: randomUUID,
};

function retryableForUser(code: MissionErrorCode): boolean {
  return [
    "timed_out",
    "rate_limited",
    "temporarily_unavailable",
    "invalid_response",
    "unsafe_response",
    "unknown_provider_error",
  ].includes(code);
}

function normalizeProviderFailure(error: unknown): AIProviderError {
  if (isAIProviderError(error)) return error;
  return new AIProviderError({
    code: "unknown_provider_error",
    retrySafe: false,
  });
}

async function callWithDeadline(
  provider: AIProvider,
  request: ProviderMissionRequest,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<ProviderMissionResult> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  if (parentSignal?.aborted) controller.abort();

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
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

async function safelyFailClaim(
  repository: MissionGenerationRepository,
  input: {
    userId: string;
    taskId: string;
    claimVersion: number;
    errorCode: MissionErrorCode;
    provider: string;
    usageRecords: MissionUsageRecord[];
  }
): Promise<MissionGenerationResult> {
  try {
    await repository.fail({
      ...input,
      promptVersion: MISSION_PROMPT_VERSION,
    });
    return {
      ok: false,
      code: input.errorCode,
      retryable: retryableForUser(input.errorCode),
      taskId: input.taskId,
    };
  } catch {
    return { ok: false, code: "database_error", retryable: false };
  }
}

export async function generateMissionForUser(
  userId: string | null,
  overrides: Partial<MissionGenerationDependencies> = {}
): Promise<MissionGenerationResult> {
  if (!userId) {
    return { ok: false, code: "unauthorized", retryable: false };
  }

  const dependencies = { ...defaultDependencies, ...overrides };
  const { repository, provider } = dependencies;

  let timezone: string | null;
  try {
    timezone = await repository.getUserTimezone(userId);
  } catch {
    return { ok: false, code: "database_error", retryable: false };
  }

  if (!timezone) {
    return { ok: false, code: "not_onboarded", retryable: false };
  }
  const scheduledDate = getUserLocalDate(dependencies.now(), timezone);
  if (!scheduledDate) {
    return { ok: false, code: "invalid_timezone", retryable: false };
  }

  try {
    provider.validateConfiguration();
  } catch (error: unknown) {
    const providerError = normalizeProviderFailure(error);
    if (!isAIProviderError(error)) {
      logSafeValidationFailure({
        stage: "provider_configuration",
        failedFields: ["provider"],
        issueCodes: ["custom"],
        category: "configuration_validation_failed",
      });
    }
    return {
      ok: false,
      code: providerError.code,
      retryable: false,
    };
  }

  let claim;
  try {
    claim = await repository.claim(userId, scheduledDate);
  } catch (error: unknown) {
    if (error instanceof MissionClaimValidationError) {
      return safelyFailClaim(repository, {
        userId,
        taskId: error.taskId,
        claimVersion: error.claimVersion,
        errorCode: "invalid_response",
        provider: provider.providerId,
        usageRecords: [],
      });
    }
    return { ok: false, code: "database_error", retryable: false };
  }

  if (claim.result === "existing") {
    if (!claim.taskId) return { ok: false, code: "database_error", retryable: false };
    return { ok: true, status: "existing", taskId: claim.taskId };
  }
  if (claim.result === "in_progress") {
    if (!claim.taskId) return { ok: false, code: "database_error", retryable: false };
    return { ok: true, status: "in_progress", taskId: claim.taskId };
  }
  if (claim.result !== "claimed" && claim.result !== "retry_claimed") {
    return {
      ok: false,
      code: claim.result,
      retryable: false,
      ...(claim.taskId ? { taskId: claim.taskId } : {}),
    };
  }

  let prompt;
  try {
    prompt = buildMissionPrompt({
      learningGoal: {
        title: claim.context.goal.title,
        technology: claim.context.goal.technology,
        taskType: claim.context.goal.task_type,
        dailyMinutes: claim.context.goal.daily_minutes,
      },
      repository: {
        name: claim.context.repository.name,
        defaultBranch: claim.context.repository.default_branch,
        isPrivate: claim.context.repository.is_private,
      },
      previousCompletedMissions: claim.context.previous_completed_missions,
      experienceLevel: claim.context.profile.experience_level,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      logSafeValidationFailure({
        stage: "prompt_input",
        ...summarizeZodIssues(error.issues),
        category: "invalid_prompt_context",
      });
    } else {
      logSafeValidationFailure({
        stage: "prompt_input",
        failedFields: ["mission_context"],
        issueCodes: ["custom"],
        category: "prompt_construction_failed",
      });
    }
    return safelyFailClaim(repository, {
      userId,
      taskId: claim.taskId,
      claimVersion: claim.claimVersion,
      errorCode: "invalid_response",
      provider: provider.providerId,
      usageRecords: [],
    });
  }

  const providerRequest: ProviderMissionRequest = {
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    responseSchemaVersion: prompt.version,
    temperature: 0.2,
    maxOutputTokens: 1_500,
  };
  const usageRecords: MissionUsageRecord[] = [];
  const operationStartedAt = dependencies.nowMs();
  let finalProviderResult: ProviderMissionResult | null = null;

  for (let callIndex = 0; callIndex < MAX_PROVIDER_CALLS; callIndex += 1) {
    const remainingOperationMs =
      OPERATION_TIMEOUT_MS - (dependencies.nowMs() - operationStartedAt);
    if (remainingOperationMs <= 0) {
      return safelyFailClaim(repository, {
        userId,
        taskId: claim.taskId,
        claimVersion: claim.claimVersion,
        errorCode: "timed_out",
        provider: provider.providerId,
        usageRecords,
      });
    }
    const providerCallId = dependencies.createCallId();
    try {
      const result = await callWithDeadline(
        provider,
        providerRequest,
        Math.min(ATTEMPT_TIMEOUT_MS, remainingOperationMs),
        dependencies.signal
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
        return safelyFailClaim(repository, {
          userId,
          taskId: claim.taskId,
          claimVersion: claim.claimVersion,
          errorCode: providerError.code,
          provider: provider.providerId,
          usageRecords,
        });
      }

      const delay =
        providerError.retryAfterMs !== null && providerError.retryAfterMs <= 2_000
          ? providerError.retryAfterMs
          : Math.round(250 + dependencies.random() * 500);
      const elapsed = dependencies.nowMs() - operationStartedAt;
      if (elapsed + delay + ATTEMPT_TIMEOUT_MS > OPERATION_TIMEOUT_MS) {
        return safelyFailClaim(repository, {
          userId,
          taskId: claim.taskId,
          claimVersion: claim.claimVersion,
          errorCode: providerError.code,
          provider: provider.providerId,
          usageRecords,
        });
      }
      await dependencies.sleep(delay);
      if (
        dependencies.nowMs() - operationStartedAt + ATTEMPT_TIMEOUT_MS >
        OPERATION_TIMEOUT_MS
      ) {
        return safelyFailClaim(repository, {
          userId,
          taskId: claim.taskId,
          claimVersion: claim.claimVersion,
          errorCode: providerError.code,
          provider: provider.providerId,
          usageRecords,
        });
      }
    }
  }

  if (!finalProviderResult) {
    return safelyFailClaim(repository, {
      userId,
      taskId: claim.taskId,
      claimVersion: claim.claimVersion,
      errorCode: "unknown_provider_error",
      provider: provider.providerId,
      usageRecords,
    });
  }

  const validation = validateMissionOutput(finalProviderResult.content, {
    dailyMinutes: claim.context.goal.daily_minutes,
    experienceLevel: claim.context.profile.experience_level,
    defaultBranch: claim.context.repository.default_branch,
  });
  if (!validation.ok) {
    return safelyFailClaim(repository, {
      userId,
      taskId: claim.taskId,
      claimVersion: claim.claimVersion,
      errorCode: validation.code,
      provider: provider.providerId,
      usageRecords,
    });
  }

  usageRecords[usageRecords.length - 1].success = true;

  try {
    const finalizeResult = await repository.finalize({
      userId,
      taskId: claim.taskId,
      claimVersion: claim.claimVersion,
      mission: validation.mission,
      provider: finalProviderResult.providerId,
      model: finalProviderResult.modelId,
      promptVersion: prompt.version,
      usageRecords,
    });

    if (finalizeResult === "finalized") {
      return { ok: true, status: "generated", taskId: claim.taskId };
    }

    return safelyFailClaim(repository, {
      userId,
      taskId: claim.taskId,
      claimVersion: claim.claimVersion,
      errorCode: "context_changed",
      provider: provider.providerId,
      usageRecords,
    });
  } catch {
    logSafeValidationFailure({
      stage: "mission_persistence",
      failedFields: ["daily_tasks"],
      issueCodes: ["custom"],
      category: "mission_finalize_failed",
    });
    return { ok: false, code: "database_error", retryable: false };
  }
}
