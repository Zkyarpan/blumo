import "server-only";

import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { AIProvider } from "@/lib/ai/ai-provider";
import {
  AIProviderError,
  isAIProviderError,
} from "@/lib/ai/ai-provider.errors";
import type { ProviderMissionRequest } from "@/lib/ai/ai-provider.types";
import { PollinationsProvider } from "@/lib/ai/pollinations/pollinations-provider";
import { validateMissionOutput } from "./mission-output.schema";
import { missionOutputSchema } from "./mission-output.schema";
import {
  buildRegenerationPromptFromContext,
  REGEN_PROMPT_VERSION,
} from "./mission-regeneration-prompt";
import {
  getMissionReviewById,
  approveMissionVersion,
  rejectMissionVersion,
  claimMissionRegeneration,
  finalizeMissionRegeneration,
  failMissionRegeneration,
  getRegenerationContext,
  type RegenClaimResult,
} from "./mission-review.repository";
import {
  logSafeValidationFailure,
  summarizeZodIssues,
} from "@/lib/validation/safe-validation-diagnostics";
import type {
  MissionReviewResult,
  ApproveResultCode,
  RejectResultCode,
  RegenerateResultCode,
} from "./mission-review.types";

const ATTEMPT_TIMEOUT_MS = 15_000;
const OPERATION_TIMEOUT_MS = 25_000;
const MAX_PROVIDER_CALLS = 2;

interface ReviewServiceDependencies {
  provider: AIProvider;
  nowMs: () => number;
  random: () => number;
  sleep: (ms: number) => Promise<void>;
  createCallId: () => string;
  signal?: AbortSignal;
}

const defaultDeps: ReviewServiceDependencies = {
  provider: new PollinationsProvider(),
  nowMs: () => Date.now(),
  random: Math.random,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  createCallId: randomUUID,
};

// --------------------------------------------------------------------------
// Read
// --------------------------------------------------------------------------

export async function getMissionReview(
  userId: string,
  taskId: string
): Promise<MissionReviewResult> {
  return getMissionReviewById(userId, taskId);
}

// --------------------------------------------------------------------------
// Approve
// --------------------------------------------------------------------------

export async function approveMission(
  userId: string,
  taskId: string,
  versionId: string
): Promise<ApproveResultCode> {
  return approveMissionVersion(userId, taskId, versionId);
}

// --------------------------------------------------------------------------
// Reject
// --------------------------------------------------------------------------

export async function rejectMission(
  userId: string,
  taskId: string,
  versionId: string,
  reason: string | null
): Promise<RejectResultCode> {
  return rejectMissionVersion(userId, taskId, versionId, reason);
}

// --------------------------------------------------------------------------
// Regenerate
// --------------------------------------------------------------------------

async function callProviderWithDeadline(
  provider: AIProvider,
  request: ProviderMissionRequest,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<{ content: unknown; modelId: string | null; inputUnits: number | null; outputUnits: number | null }> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  if (parentSignal?.aborted) controller.abort();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(
        new AIProviderError({ code: "timed_out", retrySafe: true, providerId: provider.providerId })
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      provider.generateMission(request, { signal: controller.signal }),
      timeout,
    ]);
    return {
      content: result.content,
      modelId: result.modelId,
      inputUnits: result.usage.inputUnits,
      outputUnits: result.usage.outputUnits,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function normalizeProviderFailure(error: unknown): AIProviderError {
  if (isAIProviderError(error)) return error;
  return new AIProviderError({ code: "unknown_provider_error", retrySafe: false });
}

export async function regenerateMission(
  userId: string,
  taskId: string,
  sourceVersionId: string,
  feedback: string,
  overrides: Partial<ReviewServiceDependencies> = {}
): Promise<RegenerateResultCode> {
  const deps = { ...defaultDeps, ...overrides };
  const { provider } = deps;

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
        category: "configuration_validation_failed",
      });
    }
    return providerError.code === "configuration_error"
      ? "provider_error"
      : "provider_error";
  }

  // Load review state to get task context for prompt
  const reviewState = await getMissionReviewById(userId, taskId);
  if (reviewState.kind === "not_found") return "not_found";
  if (reviewState.kind !== "found") return "database_error";

  const { task, currentVersion } = reviewState.data;
  if (!currentVersion) return "invalid_request";

  // Claim atomically
  const claim = await claimMissionRegeneration(
    userId,
    taskId,
    sourceVersionId,
    feedback
  );

  if (claim.result === "database_error") return "database_error";
  if (claim.result === "not_found") return "not_found";
  if (claim.result === "repository_unavailable") return "repository_unavailable";
  if (claim.result === "stale_version") return "stale_version";
  if (claim.result === "invalid_transition") return "invalid_transition";
  if (claim.result === "usage_limit_reached") return "usage_limit_reached";

  if (claim.result === "duplicate" || claim.result === "duplicate_succeeded") {
    // Already processing or already succeeded — not an error for the user
    return "claimed";
  }

  const { requestId, claimVersion } = claim as Extract<RegenClaimResult, { result: "claimed" }>;

  // Build regeneration context and prompt
  const regenCtx = await getRegenerationContext(
    userId,
    taskId,
    task.scheduledDate
  );
  if (!regenCtx) {
    await failMissionRegeneration({
      userId,
      taskId,
      requestId,
      claimVersion,
      errorCode: "context_changed",
      provider: provider.providerId,
      usageRecords: [],
      providerCallOccurred: false,
    });
    return "provider_error";
  }

  const rejectedMission = missionOutputSchema.safeParse({
    title: currentVersion.title,
    description: currentVersion.description,
    estimated_minutes: currentVersion.estimatedMinutes,
    difficulty: currentVersion.difficulty,
    acceptance_checklist: currentVersion.acceptanceChecklist,
    suggested_commit_message: currentVersion.suggestedCommitMessage,
    suggested_branch: currentVersion.suggestedBranch,
    learning_outcome: currentVersion.learningOutcome,
  });
  if (!rejectedMission.success) {
    await failMissionRegeneration({
      userId,
      taskId,
      requestId,
      claimVersion,
      errorCode: "invalid_response",
      provider: provider.providerId,
      usageRecords: [],
      providerCallOccurred: false,
    });
    return "provider_error";
  }

  let prompt;
  try {
    prompt = buildRegenerationPromptFromContext(
      regenCtx,
      rejectedMission.data,
      feedback
    );
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      logSafeValidationFailure({
        stage: "regeneration_prompt_input",
        ...summarizeZodIssues(error.issues),
        category: "invalid_prompt_context",
      });
    }
    await failMissionRegeneration({
      userId,
      taskId,
      requestId,
      claimVersion,
      errorCode: "invalid_response",
      provider: provider.providerId,
      usageRecords: [],
      providerCallOccurred: false,
    });
    return "provider_error";
  }

  const providerRequest: ProviderMissionRequest = {
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    responseSchemaVersion: prompt.version,
    temperature: 0.4,
    maxOutputTokens: 1_500,
  };

  const usageRecords: Array<{
    provider_call_id: string;
    model: string | null;
    input_units: number | null;
    output_units: number | null;
    success: boolean;
  }> = [];

  const operationStart = deps.nowMs();
  let finalContent: unknown = null;
  let finalModel: string | null = null;

  for (let callIndex = 0; callIndex < MAX_PROVIDER_CALLS; callIndex += 1) {
    const remaining = OPERATION_TIMEOUT_MS - (deps.nowMs() - operationStart);
    if (remaining <= 0) {
      await failMissionRegeneration({
        userId, taskId, requestId, claimVersion,
        errorCode: "timed_out",
        provider: provider.providerId,
        usageRecords,
        providerCallOccurred: usageRecords.length > 0,
      });
      return "provider_error";
    }

    const callId = deps.createCallId();
    try {
      const result = await callProviderWithDeadline(
        provider,
        providerRequest,
        Math.min(ATTEMPT_TIMEOUT_MS, remaining),
        deps.signal
      );
      finalContent = result.content;
      finalModel = result.modelId;
      usageRecords.push({
        provider_call_id: callId,
        model: result.modelId,
        input_units: result.inputUnits,
        output_units: result.outputUnits,
        success: false,
      });
      break;
    } catch (error: unknown) {
      const providerError = normalizeProviderFailure(error);
      if (providerError.code !== "configuration_error") {
        usageRecords.push({
          provider_call_id: callId,
          model: providerError.modelId,
          input_units: null,
          output_units: null,
          success: false,
        });
      }
      const mayRetry = providerError.retrySafe && callIndex === 0;
      if (!mayRetry) {
        await failMissionRegeneration({
          userId, taskId, requestId, claimVersion,
          errorCode: providerError.code,
          provider: provider.providerId,
          usageRecords,
          providerCallOccurred: usageRecords.length > 0,
        });
        return "provider_error";
      }
      const delay =
        providerError.retryAfterMs !== null && providerError.retryAfterMs <= 2_000
          ? providerError.retryAfterMs
          : Math.round(250 + deps.random() * 500);
      const elapsed = deps.nowMs() - operationStart;
      if (elapsed + delay + ATTEMPT_TIMEOUT_MS > OPERATION_TIMEOUT_MS) {
        await failMissionRegeneration({
          userId, taskId, requestId, claimVersion,
          errorCode: providerError.code,
          provider: provider.providerId,
          usageRecords,
          providerCallOccurred: usageRecords.length > 0,
        });
        return "provider_error";
      }
      await deps.sleep(delay);
    }
  }

  if (finalContent === null) {
    await failMissionRegeneration({
      userId, taskId, requestId, claimVersion,
      errorCode: "unknown_provider_error",
      provider: provider.providerId,
      usageRecords,
      providerCallOccurred: usageRecords.length > 0,
    });
    return "provider_error";
  }

  const validation = validateMissionOutput(finalContent, {
    dailyMinutes: regenCtx.goal.daily_minutes as 10 | 20 | 30 | 45 | 60,
    experienceLevel: regenCtx.profile.experience_level as "beginner" | "intermediate" | "advanced",
    defaultBranch: regenCtx.repository.default_branch,
  });
  if (!validation.ok) {
    await failMissionRegeneration({
      userId, taskId, requestId, claimVersion,
      errorCode: validation.code,
      provider: provider.providerId,
      usageRecords,
      providerCallOccurred: usageRecords.length > 0,
    });
    return "provider_error";
  }

  // Mark last usage record successful
  usageRecords[usageRecords.length - 1].success = true;

  const finalizeResult = await finalizeMissionRegeneration({
    userId,
    taskId,
    requestId,
    claimVersion,
    mission: validation.mission,
    provider: provider.providerId,
    model: finalModel,
    promptVersion: REGEN_PROMPT_VERSION,
    usageRecords,
  });

  if (finalizeResult === "finalized") return "claimed";

  // Finalization failed — record the failure
  await failMissionRegeneration({
    userId, taskId, requestId, claimVersion,
    errorCode: finalizeResult === "context_changed" ? "context_changed" : "invalid_response",
    provider: provider.providerId,
    usageRecords,
    providerCallOccurred: true,
  });

  return finalizeResult === "context_changed" ? "provider_error" : "database_error";
}
