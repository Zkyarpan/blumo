import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/ai/pollinations/pollinations-provider", () => ({
  PollinationsProvider: vi.fn().mockImplementation(() => ({
    providerId: "pollinations",
    validateConfiguration: vi.fn(),
    generateMission: vi.fn(),
  })),
}));

import type { MissionReviewRepository, MissionRegenerationClaimResult } from "./mission-review.repository";
import {
  getMissionReviewModel,
  approveMission,
  rejectMission,
  regenerateMission,
} from "./mission-review.service";
import type { MissionOutput } from "./mission-output.schema";
import { AIProviderError } from "@/lib/ai/ai-provider.errors";
import type { AIProvider } from "@/lib/ai/ai-provider";
import type { ProviderMissionResult } from "@/lib/ai/ai-provider.types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_MISSION: MissionOutput = {
  title: "Document state transitions",
  description: "Write a short document explaining two state transitions in a system you understand.",
  estimated_minutes: 30,
  difficulty: "beginner",
  acceptance_checklist: [
    "Identify two state transitions",
    "Write a plain-language description of each",
  ],
  suggested_commit_message: "Document state transitions",
  suggested_branch: "main",
  learning_outcome: "Articulate how systems change state and what triggers the change.",
};

const BASE_REVIEW_MODEL = {
  taskId: "task-uuid",
  scheduledDate: "2026-07-20",
  status: "generated" as const,
  reviewOperationStatus: "idle" as const,
  currentVersionNumber: 1,
  currentVersionId: "version-uuid",
  versionCreatedAt: "2026-07-20T10:00:00Z",
  regenerationCount: 0,
  mission: VALID_MISSION,
  approvedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  repository: { fullName: "user/learning-notes", isAvailable: true },
};

const REGENERATION_CONTEXT = {
  profile: { experience_level: "beginner", timezone: "Europe/London" },
  goal: { title: "Learn TypeScript", technology: "TypeScript", task_type: "learning_note", daily_minutes: 30 },
  repository: { name: "learning-notes", default_branch: "main", is_private: false },
  previous_completed_missions: [],
  scheduled_date: "2026-07-20",
  rejected_version: {
    version_number: 1,
    title: "Document state transitions",
    description: "Write a short document explaining two state transitions in a system you understand.",
    difficulty: "beginner",
    estimated_minutes: 30,
    acceptance_checklist: ["Identify two state transitions", "Write a plain-language description of each"],
    suggested_commit_message: "Document state transitions",
    learning_outcome: "Articulate how systems change state and what triggers the change.",
  },
  feedback: "Please make the mission more practical with examples.",
};

function makeRepository(overrides: Partial<MissionReviewRepository> = {}): MissionReviewRepository {
  return {
    getReviewModel: vi.fn().mockResolvedValue(BASE_REVIEW_MODEL),
    approve: vi.fn().mockResolvedValue({ ok: true, code: "approved" }),
    reject: vi.fn().mockResolvedValue({ ok: true, code: "rejected" }),
    claimRegeneration: vi.fn().mockResolvedValue({
      result: "claimed",
      requestId: "req-uuid",
      claimVersion: 1,
      sourceVersionId: "version-uuid",
      context: REGENERATION_CONTEXT,
    } as MissionRegenerationClaimResult),
    finalizeRegeneration: vi.fn().mockResolvedValue("finalized"),
    failRegeneration: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  const providerResult: ProviderMissionResult = {
    content: {
      title: "Practice TypeScript generics in small steps",
      description: "Write a practical example to see how generic functions behave with real types.",
      estimated_minutes: 30,
      difficulty: "beginner",
      acceptance_checklist: [
        "Write one generic function that works with two types",
        "Observe how type inference works in practice",
      ],
      suggested_commit_message: "Add TypeScript generics practice notes",
      suggested_branch: "main",
      learning_outcome: "See how generics reduce code duplication in a real context.",
    },
    providerId: "pollinations",
    modelId: "openai-large",
    usage: { inputUnits: 100, outputUnits: 200 },
    requestId: "provider-req-id",
  };

  return {
    providerId: "pollinations",
    validateConfiguration: vi.fn(),
    generateMission: vi.fn().mockResolvedValue(providerResult),
    ...overrides,
  };
}

// ─── getMissionReviewModel ────────────────────────────────────────────────────

describe("getMissionReviewModel", () => {
  it("returns null for null userId", async () => {
    const repository = makeRepository();
    const result = await getMissionReviewModel(null, "task-uuid", { repository });
    expect(result).toBeNull();
    expect(repository.getReviewModel).not.toHaveBeenCalled();
  });

  it("returns the model for a valid owner", async () => {
    const repository = makeRepository();
    const result = await getMissionReviewModel("user-uuid", "task-uuid", { repository });
    expect(result).toEqual(BASE_REVIEW_MODEL);
    expect(repository.getReviewModel).toHaveBeenCalledWith("user-uuid", "task-uuid");
  });

  it("returns null when repository throws", async () => {
    const repository = makeRepository({
      getReviewModel: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    const result = await getMissionReviewModel("user-uuid", "task-uuid", { repository });
    expect(result).toBeNull();
  });

  it("returns null when task is not found", async () => {
    const repository = makeRepository({
      getReviewModel: vi.fn().mockResolvedValue(null),
    });
    const result = await getMissionReviewModel("user-uuid", "task-uuid", { repository });
    expect(result).toBeNull();
  });
});

// ─── approveMission ───────────────────────────────────────────────────────────

describe("approveMission", () => {
  it("returns unauthorized for null userId", async () => {
    const repository = makeRepository();
    const result = await approveMission(null, "task-uuid", 1, { repository });
    expect(result).toEqual({ ok: false, code: "unauthorized" });
    expect(repository.approve).not.toHaveBeenCalled();
  });

  it("approves a valid generated mission", async () => {
    const repository = makeRepository();
    const result = await approveMission("user-uuid", "task-uuid", 1, { repository });
    expect(result).toEqual({ ok: true, code: "approved" });
    expect(repository.approve).toHaveBeenCalledWith("user-uuid", "task-uuid", 1);
  });

  it("returns already_approved for idempotent approval", async () => {
    const repository = makeRepository({
      approve: vi.fn().mockResolvedValue({ ok: true, code: "already_approved" }),
    });
    const result = await approveMission("user-uuid", "task-uuid", 1, { repository });
    expect(result).toEqual({ ok: true, code: "already_approved" });
  });

  it("returns repository_unavailable when repository is unavailable", async () => {
    const repository = makeRepository({
      approve: vi.fn().mockResolvedValue({ ok: false, code: "repository_unavailable" }),
    });
    const result = await approveMission("user-uuid", "task-uuid", 1, { repository });
    expect(result).toEqual({ ok: false, code: "repository_unavailable" });
  });

  it("returns invalid_transition for rejected task", async () => {
    const repository = makeRepository({
      approve: vi.fn().mockResolvedValue({ ok: false, code: "invalid_transition" }),
    });
    const result = await approveMission("user-uuid", "task-uuid", 1, { repository });
    expect(result).toEqual({ ok: false, code: "invalid_transition" });
  });

  it("returns stale_version for stale form", async () => {
    const repository = makeRepository({
      approve: vi.fn().mockResolvedValue({ ok: false, code: "stale_version" }),
    });
    const result = await approveMission("user-uuid", "task-uuid", 1, { repository });
    expect(result).toEqual({ ok: false, code: "stale_version" });
  });

  it("returns not_found for a foreign or missing task", async () => {
    const repository = makeRepository({
      approve: vi.fn().mockResolvedValue({ ok: false, code: "not_found" }),
    });
    const result = await approveMission("user-uuid", "task-uuid", 1, { repository });
    expect(result).toEqual({ ok: false, code: "not_found" });
  });

  it("returns database_error when repository throws", async () => {
    const repository = makeRepository({
      approve: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    const result = await approveMission("user-uuid", "task-uuid", 1, { repository });
    expect(result).toEqual({ ok: false, code: "database_error" });
  });
});

// ─── rejectMission ────────────────────────────────────────────────────────────

describe("rejectMission", () => {
  it("returns unauthorized for null userId", async () => {
    const repository = makeRepository();
    const result = await rejectMission(null, "task-uuid", 1, null, { repository });
    expect(result).toEqual({ ok: false, code: "unauthorized" });
  });

  it("rejects a generated mission without a reason", async () => {
    const repository = makeRepository();
    const result = await rejectMission("user-uuid", "task-uuid", 1, null, { repository });
    expect(result).toEqual({ ok: true, code: "rejected" });
    expect(repository.reject).toHaveBeenCalledWith("user-uuid", "task-uuid", 1, null);
  });

  it("rejects a generated mission with a valid reason", async () => {
    const repository = makeRepository();
    const result = await rejectMission(
      "user-uuid",
      "task-uuid",
      1,
      "Mission is too abstract",
      { repository }
    );
    expect(result).toEqual({ ok: true, code: "rejected" });
    expect(repository.reject).toHaveBeenCalledWith(
      "user-uuid",
      "task-uuid",
      1,
      "Mission is too abstract"
    );
  });

  it("returns already_rejected for idempotent rejection", async () => {
    const repository = makeRepository({
      reject: vi.fn().mockResolvedValue({ ok: true, code: "already_rejected" }),
    });
    const result = await rejectMission("user-uuid", "task-uuid", 1, null, { repository });
    expect(result).toEqual({ ok: true, code: "already_rejected" });
  });

  it("returns invalid_transition for an approved task", async () => {
    const repository = makeRepository({
      reject: vi.fn().mockResolvedValue({ ok: false, code: "invalid_transition" }),
    });
    const result = await rejectMission("user-uuid", "task-uuid", 1, null, { repository });
    expect(result).toEqual({ ok: false, code: "invalid_transition" });
  });

  it("returns database_error when repository throws", async () => {
    const repository = makeRepository({
      reject: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    const result = await rejectMission("user-uuid", "task-uuid", 1, null, { repository });
    expect(result).toEqual({ ok: false, code: "database_error" });
  });
});

// ─── regenerateMission ────────────────────────────────────────────────────────

describe("regenerateMission", () => {
  it("returns unauthorized for null userId", async () => {
    const repository = makeRepository();
    const provider = makeProvider();
    const result = await regenerateMission(null, "task-uuid", 1, "Valid feedback text here.", {
      repository,
      provider,
    });
    expect(result).toEqual({ ok: false, code: "unauthorized" });
    expect(provider.validateConfiguration).not.toHaveBeenCalled();
  });

  it("returns configuration_error when provider config is invalid", async () => {
    const repository = makeRepository();
    const provider = makeProvider({
      validateConfiguration: vi.fn().mockImplementation(() => {
        throw new AIProviderError({ code: "configuration_error", retrySafe: false });
      }),
    });
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "Please focus on a more practical example for beginners.",
      { repository, provider }
    );
    expect(result).toEqual({ ok: false, code: "configuration_error" });
    expect(repository.claimRegeneration).not.toHaveBeenCalled();
  });

  it("succeeds with valid input and provider response", async () => {
    const repository = makeRepository();
    const provider = makeProvider();
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "Please focus on a more practical example for beginners.",
      { repository, provider, nowMs: () => 0 }
    );
    expect(result).toEqual({ ok: true, code: "claimed" });
    expect(repository.claimRegeneration).toHaveBeenCalledWith(
      "user-uuid",
      "task-uuid",
      1,
      "Please focus on a more practical example for beginners."
    );
    expect(repository.finalizeRegeneration).toHaveBeenCalled();
  });

  it("returns usage_limit_reached when limit is enforced by claim", async () => {
    const repository = makeRepository({
      claimRegeneration: vi.fn().mockResolvedValue({ result: "usage_limit_reached" }),
    });
    const provider = makeProvider();
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "More practical examples please for this task.",
      { repository, provider }
    );
    expect(result).toEqual({ ok: false, code: "usage_limit_reached" });
    expect(provider.generateMission).not.toHaveBeenCalled();
  });

  it("returns repository_unavailable when repository is unavailable", async () => {
    const repository = makeRepository({
      claimRegeneration: vi.fn().mockResolvedValue({ result: "repository_unavailable" }),
    });
    const provider = makeProvider();
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "More practical examples please for this task.",
      { repository, provider }
    );
    expect(result).toEqual({ ok: false, code: "repository_unavailable" });
  });

  it("returns invalid_transition for non-rejected source", async () => {
    const repository = makeRepository({
      claimRegeneration: vi.fn().mockResolvedValue({ result: "invalid_transition" }),
    });
    const provider = makeProvider();
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "More practical examples please for this task.",
      { repository, provider }
    );
    expect(result).toEqual({ ok: false, code: "invalid_transition" });
    expect(provider.generateMission).not.toHaveBeenCalled();
  });

  it("returns stale_version for stale expected version", async () => {
    const repository = makeRepository({
      claimRegeneration: vi.fn().mockResolvedValue({ result: "stale_version" }),
    });
    const provider = makeProvider();
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "More practical examples please for this task.",
      { repository, provider }
    );
    expect(result).toEqual({ ok: false, code: "stale_version" });
  });

  it("returns processing for an in-progress regeneration claim", async () => {
    const repository = makeRepository({
      claimRegeneration: vi.fn().mockResolvedValue({
        result: "processing",
        requestId: "req-uuid",
        claimVersion: 1,
        sourceVersionId: "version-uuid",
        context: null,
      }),
    });
    const provider = makeProvider();
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "More practical examples please for this task.",
      { repository, provider }
    );
    expect(result).toEqual({ ok: true, code: "processing" });
    expect(provider.generateMission).not.toHaveBeenCalled();
  });

  it("handles provider failure and calls failRegeneration", async () => {
    const repository = makeRepository();
    const provider = makeProvider({
      generateMission: vi.fn().mockRejectedValue(
        new AIProviderError({ code: "temporarily_unavailable", retrySafe: false })
      ),
    });
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "Please focus on a more practical example for beginners.",
      {
        repository,
        provider,
        nowMs: () => 0,
        random: () => 0.5,
        sleep: async () => {},
      }
    );
    expect(result.ok).toBe(false);
    expect(repository.failRegeneration).toHaveBeenCalled();
    expect(repository.finalizeRegeneration).not.toHaveBeenCalled();
  });

  it("fails and calls failRegeneration when finalize returns stale", async () => {
    const repository = makeRepository({
      finalizeRegeneration: vi.fn().mockResolvedValue("stale"),
    });
    const provider = makeProvider();
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "Please focus on a more practical example for beginners.",
      { repository, provider, nowMs: () => 0 }
    );
    expect(result.ok).toBe(false);
    expect(repository.failRegeneration).toHaveBeenCalled();
  });

  it("does not call provider when approved missions are returned by claim", async () => {
    // approved -> invalid_transition from claim
    const repository = makeRepository({
      claimRegeneration: vi.fn().mockResolvedValue({ result: "invalid_transition" }),
    });
    const provider = makeProvider();
    await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "More practical examples please for this task.",
      { repository, provider }
    );
    expect(provider.generateMission).not.toHaveBeenCalled();
  });

  it("returns database_error when claim RPC throws", async () => {
    const repository = makeRepository({
      claimRegeneration: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    const provider = makeProvider();
    const result = await regenerateMission(
      "user-uuid",
      "task-uuid",
      1,
      "Please focus on a more practical example for beginners.",
      { repository, provider }
    );
    expect(result).toEqual({ ok: false, code: "database_error" });
  });
});
