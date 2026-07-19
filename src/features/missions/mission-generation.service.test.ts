import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { AIProviderError } from "@/lib/ai/ai-provider.errors";
import type { AIProvider } from "@/lib/ai/ai-provider";
import type {
  MissionClaim,
  MissionGenerationRepository,
} from "./mission-generation.repository";
import { MissionClaimValidationError } from "./mission-generation.repository";
import { generateMissionForUser } from "./mission-generation.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";

const CONTEXT = {
  profile: { experience_level: "beginner" as const, timezone: "Europe/London" },
  goal: {
    title: "Become confident with React",
    technology: "React",
    task_type: "learning_note" as const,
    daily_minutes: 30 as const,
  },
  repository: {
    name: "learning-notes",
    default_branch: "main",
    is_private: true,
  },
  previous_completed_missions: [],
  scheduled_date: "2026-07-19",
};

const VALID_MISSION = {
  title: "Practice state transition reasoning",
  description:
    "Create a small conceptual example that explains how a value changes across two user interactions.",
  estimated_minutes: 30,
  difficulty: "beginner",
  acceptance_checklist: [
    "Describe two observable state transitions in plain language",
    "Explain why each transition produces its expected result",
  ],
  suggested_commit_message: "Document state transition reasoning",
  suggested_branch: "main",
  learning_outcome: "Explain predictable state transitions using a focused example.",
};

function createRepository(claim?: MissionClaim) {
  return {
    getUserTimezone: vi.fn().mockResolvedValue("Europe/London"),
    claim: vi.fn().mockResolvedValue(
      claim ?? {
        result: "claimed",
        taskId: TASK_ID,
        claimVersion: 1,
        context: CONTEXT,
      }
    ),
    finalize: vi.fn().mockResolvedValue("finalized"),
    fail: vi.fn().mockResolvedValue(true),
  } satisfies MissionGenerationRepository;
}

function createProvider() {
  return {
    providerId: "fake-provider",
    validateConfiguration: vi.fn(),
    generateMission: vi.fn().mockResolvedValue({
      content: JSON.stringify(VALID_MISSION),
      providerId: "fake-provider",
      modelId: "fake-model",
      usage: { inputUnits: 20, outputUnits: 30 },
      requestId: null,
    }),
  } satisfies AIProvider;
}

function dependencies(
  repository: MissionGenerationRepository,
  provider: AIProvider
) {
  let callNumber = 0;
  return {
    repository,
    provider,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    nowMs: () => 0,
    random: () => 0.5,
    sleep: vi.fn().mockResolvedValue(undefined),
    createCallId: () =>
      `00000000-0000-4000-8000-${String(++callNumber).padStart(12, "0")}`,
  };
}

describe("generateMissionForUser", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("returns unauthorized before database or provider work", async () => {
    const repository = createRepository();
    const provider = createProvider();
    const result = await generateMissionForUser(null, dependencies(repository, provider));
    expect(result).toEqual({ ok: false, code: "unauthorized", retryable: false });
    expect(repository.getUserTimezone).not.toHaveBeenCalled();
    expect(provider.generateMission).not.toHaveBeenCalled();
  });

  it("returns not_onboarded for a missing profile without claiming an attempt", async () => {
    const repository = createRepository();
    repository.getUserTimezone.mockResolvedValue(null);
    const provider = createProvider();

    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, provider)
    );

    expect(result).toEqual({
      ok: false,
      code: "not_onboarded",
      retryable: false,
    });
    expect(repository.claim).not.toHaveBeenCalled();
    expect(provider.validateConfiguration).not.toHaveBeenCalled();
    expect(provider.generateMission).not.toHaveBeenCalled();
  });

  it("checks provider configuration before claiming an attempt", async () => {
    const repository = createRepository();
    const provider = createProvider();
    vi.mocked(provider.validateConfiguration).mockImplementation(() => {
      throw new AIProviderError({
        code: "configuration_error",
        retrySafe: false,
        providerId: "fake-provider",
      });
    });

    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, provider)
    );

    expect(result).toEqual({
      ok: false,
      code: "configuration_error",
      retryable: false,
    });
    expect(repository.claim).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
    expect(provider.generateMission).not.toHaveBeenCalled();
  });

  it("releases a claimed attempt when stored prompt context fails validation", async () => {
    const repository = createRepository();
    repository.claim.mockRejectedValue(
      new MissionClaimValidationError(TASK_ID, 1)
    );
    const provider = createProvider();

    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, provider)
    );

    expect(result).toMatchObject({
      ok: false,
      code: "invalid_response",
      retryable: true,
    });
    expect(provider.generateMission).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        claimVersion: 1,
        usageRecords: [],
      })
    );
  });

  it.each([
    "not_onboarded",
    "no_active_goal",
    "no_active_repository",
    "context_changed",
    "retry_exhausted",
    "retry_not_allowed",
  ] as const)("returns claim prerequisite %s without provider work", async (claimResult) => {
    const repository = createRepository({
      result: claimResult,
      taskId: claimResult.startsWith("retry") ? TASK_ID : null,
      claimVersion: null,
    });
    const provider = createProvider();
    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, provider)
    );
    expect(result).toMatchObject({ ok: false, code: claimResult });
    expect(provider.generateMission).not.toHaveBeenCalled();
  });

  it.each(["existing", "in_progress"] as const)(
    "returns %s without a duplicate provider call",
    async (claimResult) => {
      const repository = createRepository({
        result: claimResult,
        taskId: TASK_ID,
        claimVersion: 1,
      });
      const provider = createProvider();
      const result = await generateMissionForUser(
        USER_ID,
        dependencies(repository, provider)
      );
      expect(result).toEqual({ ok: true, status: claimResult, taskId: TASK_ID });
      expect(provider.generateMission).not.toHaveBeenCalled();
    }
  );

  it("validates and atomically finalizes every mission field and successful usage", async () => {
    const repository = createRepository();
    const provider = createProvider();
    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, provider)
    );

    expect(result).toEqual({ ok: true, status: "generated", taskId: TASK_ID });
    expect(repository.finalize).toHaveBeenCalledTimes(1);
    expect(repository.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        taskId: TASK_ID,
        claimVersion: 1,
        mission: VALID_MISSION,
        provider: "fake-provider",
        model: "fake-model",
        promptVersion: "mission-v2",
        usageRecords: [
          expect.objectContaining({
            input_units: 20,
            output_units: 30,
            success: true,
          }),
        ],
      })
    );
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("retries one transient provider call and records one usage row per call", async () => {
    const repository = createRepository();
    const provider = createProvider();
    vi.mocked(provider.generateMission)
      .mockRejectedValueOnce(
        new AIProviderError({
          code: "temporarily_unavailable",
          retrySafe: true,
          retryAfterMs: 1_000,
          providerId: "fake-provider",
          modelId: "fake-model",
        })
      )
      .mockResolvedValueOnce({
        content: VALID_MISSION,
        providerId: "fake-provider",
        modelId: "fake-model",
        usage: { inputUnits: 10, outputUnits: 15 },
        requestId: null,
      });
    const deps = dependencies(repository, provider);

    const result = await generateMissionForUser(USER_ID, deps);
    expect(result.ok).toBe(true);
    expect(provider.generateMission).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledWith(1_000);
    expect(repository.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        usageRecords: [
          expect.objectContaining({ success: false }),
          expect.objectContaining({ success: true, input_units: 10, output_units: 15 }),
        ],
      })
    );
  });

  it("does not auto-retry invalid mission content and fails only the current claim", async () => {
    const repository = createRepository();
    const provider = createProvider();
    vi.mocked(provider.generateMission).mockResolvedValue({
      content: { ...VALID_MISSION, suggested_branch: "invented-branch" },
      providerId: "fake-provider",
      modelId: "fake-model",
      usage: { inputUnits: null, outputUnits: null },
      requestId: null,
    });

    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, provider)
    );
    expect(result).toMatchObject({
      ok: false,
      code: "invalid_response",
      retryable: true,
      taskId: TASK_ID,
    });
    expect(provider.generateMission).toHaveBeenCalledTimes(1);
    expect(repository.finalize).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        claimVersion: 1,
        errorCode: "invalid_response",
        usageRecords: [expect.objectContaining({ success: false })],
      })
    );
  });

  it("rejects malformed AI JSON and records the provider call as the failed attempt", async () => {
    const repository = createRepository();
    const provider = createProvider();
    vi.mocked(provider.generateMission).mockResolvedValue({
      content: "{not valid mission json",
      providerId: "fake-provider",
      modelId: "fake-model",
      usage: { inputUnits: 14, outputUnits: 3 },
      requestId: null,
    });

    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, provider)
    );

    expect(result).toMatchObject({
      ok: false,
      code: "invalid_response",
      retryable: true,
    });
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        usageRecords: [
          expect.objectContaining({
            input_units: 14,
            output_units: 3,
            success: false,
          }),
        ],
      })
    );
    expect(repository.finalize).not.toHaveBeenCalled();
  });

  it("does not count prompt validation failures as provider attempts", async () => {
    const repository = createRepository({
      result: "claimed",
      taskId: TASK_ID,
      claimVersion: 1,
      context: {
        ...CONTEXT,
        goal: { ...CONTEXT.goal, title: "bad" },
      },
    });
    const provider = createProvider();

    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, provider)
    );

    expect(result).toMatchObject({ ok: false, code: "invalid_response" });
    expect(provider.generateMission).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ usageRecords: [] })
    );
  });

  it("fails closed when repository or installation context changes at finalization", async () => {
    const repository = createRepository();
    repository.finalize.mockResolvedValue("context_changed");
    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, createProvider())
    );
    expect(result).toMatchObject({ ok: false, code: "context_changed" });
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "context_changed" })
    );
  });

  it("does not persist raw provider errors or output", async () => {
    const repository = createRepository();
    const provider = createProvider();
    vi.mocked(provider.generateMission).mockRejectedValue(
      new AIProviderError({
        code: "authentication_error",
        retrySafe: false,
        providerId: "fake-provider",
      })
    );
    const result = await generateMissionForUser(
      USER_ID,
      dependencies(repository, provider)
    );
    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "authentication_error" })
    );
    const failureInput = repository.fail.mock.calls[0][0];
    expect(JSON.stringify(failureInput)).not.toContain("systemPrompt");
    expect(JSON.stringify(failureInput)).not.toContain("provider error");
  });

  it("aborts a 15-second attempt and stops when the 25-second budget cannot fit a retry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:00:00.000Z"));
    const repository = createRepository();
    const provider = createProvider();
    vi.mocked(provider.generateMission).mockImplementation(
      () => new Promise(() => undefined)
    );
    const deps = {
      ...dependencies(repository, provider),
      nowMs: () => Date.now(),
    };

    const pendingResult = generateMissionForUser(USER_ID, deps);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pendingResult).resolves.toMatchObject({
      ok: false,
      code: "timed_out",
      retryable: true,
    });
    expect(provider.generateMission).toHaveBeenCalledTimes(1);
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "timed_out" })
    );
  });
});
