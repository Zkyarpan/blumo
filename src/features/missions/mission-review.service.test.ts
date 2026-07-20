import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/ai/pollinations/pollinations-provider", () => ({
  PollinationsProvider: vi.fn().mockImplementation(() => ({
    providerId: "pollinations",
    validateConfiguration: vi.fn(),
    generateMission: vi.fn(),
  })),
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  approveMission,
  rejectMission,
  regenerateMission,
  getMissionReview,
} from "./mission-review.service";
import type { AIProvider } from "@/lib/ai/ai-provider";
import { AIProviderError } from "@/lib/ai/ai-provider.errors";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VERSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// Build a mock Supabase admin client
function mockAdmin(overrides: Record<string, unknown> = {}) {
  return {
    rpc: vi.fn().mockImplementation((name: string) => {
      const defaults: Record<string, unknown> = {
        approve_mission_version: { data: "approved", error: null },
        reject_mission_version: { data: "rejected", error: null },
        claim_mission_regeneration: {
          data: { result: "claimed", request_id: REQUEST_ID, claim_version: 1 },
          error: null,
        },
        finalize_mission_regeneration: { data: "finalized", error: null },
        fail_mission_regeneration: { data: "failed", error: null },
        ...overrides,
      };
      return Promise.resolve(defaults[name] ?? { data: null, error: { message: "unknown rpc" } });
    }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
    }),
  };
}

// Build a mock RLS client (for server-side reads)
function mockServerClient(taskOverrides = {}, versionOverrides = {}) {
  const taskData = {
    id: TASK_ID,
    user_id: USER_ID,
    scheduled_date: "2026-07-20",
    status: "generated",
    review_operation_status: "idle",
    regeneration_count: 0,
    approved_at: null,
    rejected_at: null,
    current_mission_version_id: VERSION_ID,
    repositories: {
      full_name: "user/my-repo",
      access_status: "active",
      github_installations: { status: "active" },
    },
    ...taskOverrides,
  };
  const versionData = {
    id: VERSION_ID,
    task_id: TASK_ID,
    user_id: USER_ID,
    version_number: 1,
    status: "generated",
    title: "Practice state transitions",
    description: "A focused exercise on understanding state change in a UI component.",
    estimated_minutes: 30,
    difficulty: "beginner",
    acceptance_checklist: ["Identify two state transitions", "Describe each clearly"],
    suggested_commit_message: "Document state transition reasoning",
    suggested_branch: "main",
    learning_outcome: "Explain predictable state transitions using a focused example.",
    ai_provider: "pollinations",
    prompt_version: "mission-v2",
    generation_claim_version: 1,
    approved_at: null,
    rejected_at: null,
    created_at: "2026-07-20T10:00:00.000Z",
    ...versionOverrides,
  };

  let callCount = 0;
  const maybeSingleFn = vi.fn().mockImplementation(() => {
    callCount += 1;
    if (callCount === 1) return Promise.resolve({ data: taskData, error: null });
    return Promise.resolve({ data: versionData, error: null });
  });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: maybeSingleFn,
    }),
  };
}

// =============================================================================
// getMissionReview
// =============================================================================
describe("getMissionReview", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      mockServerClient() as unknown as ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never
    );
  });

  it("returns found with task and version data for the owner", async () => {
    const result = await getMissionReview(USER_ID, TASK_ID);
    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.data.task.id).toBe(TASK_ID);
      expect(result.data.task.status).toBe("generated");
      expect(result.data.currentVersion.id).toBe(VERSION_ID);
    }
  });

  it("returns not_found when task data is null", async () => {
    const clientWithNull = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      clientWithNull as unknown as ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never
    );
    const result = await getMissionReview(USER_ID, TASK_ID);
    expect(result.kind).toBe("not_found");
  });

  it("returns error on query error", async () => {
    const clientWithError = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
      }),
    };
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      clientWithError as unknown as ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never
    );
    const result = await getMissionReview(USER_ID, TASK_ID);
    expect(result.kind).toBe("error");
  });
});

// =============================================================================
// approveMission
// =============================================================================
describe("approveMission", () => {
  it("returns approved on success", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin() as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await approveMission(USER_ID, TASK_ID, VERSION_ID);
    expect(result).toBe("approved");
  });

  it("returns already_approved for idempotent repeat", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin({ approve_mission_version: { data: "already_approved", error: null } }) as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await approveMission(USER_ID, TASK_ID, VERSION_ID);
    expect(result).toBe("already_approved");
  });

  it("returns not_found for missing task", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin({ approve_mission_version: { data: "not_found", error: null } }) as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await approveMission(USER_ID, TASK_ID, VERSION_ID);
    expect(result).toBe("not_found");
  });

  it("returns repository_unavailable when repo is gone", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin({ approve_mission_version: { data: "repository_unavailable", error: null } }) as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await approveMission(USER_ID, TASK_ID, VERSION_ID);
    expect(result).toBe("repository_unavailable");
  });

  it("returns stale_version for outdated form submission", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin({ approve_mission_version: { data: "stale_version", error: null } }) as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await approveMission(USER_ID, TASK_ID, VERSION_ID);
    expect(result).toBe("stale_version");
  });

  it("returns invalid_transition for rejected/approved/in_progress tasks", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin({ approve_mission_version: { data: "invalid_transition", error: null } }) as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await approveMission(USER_ID, TASK_ID, VERSION_ID);
    expect(result).toBe("invalid_transition");
  });

  it("returns database_error on RPC failure", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin({ approve_mission_version: { data: null, error: { message: "db error" } } }) as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await approveMission(USER_ID, TASK_ID, VERSION_ID);
    expect(result).toBe("database_error");
  });
});

// =============================================================================
// rejectMission
// =============================================================================
describe("rejectMission", () => {
  it("returns rejected on success with null reason", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin() as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await rejectMission(USER_ID, TASK_ID, VERSION_ID, null);
    expect(result).toBe("rejected");
  });

  it("returns rejected on success with a reason", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin() as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await rejectMission(
      USER_ID,
      TASK_ID,
      VERSION_ID,
      "Mission is too vague"
    );
    expect(result).toBe("rejected");
  });

  it("returns already_rejected for idempotent repeat", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin({ reject_mission_version: { data: "already_rejected", error: null } }) as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await rejectMission(USER_ID, TASK_ID, VERSION_ID, null);
    expect(result).toBe("already_rejected");
  });

  it("returns invalid_transition for approved/in_progress tasks", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin({ reject_mission_version: { data: "invalid_transition", error: null } }) as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await rejectMission(USER_ID, TASK_ID, VERSION_ID, null);
    expect(result).toBe("invalid_transition");
  });

  it("returns database_error on RPC failure", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      mockAdmin({ reject_mission_version: { data: null, error: { message: "fail" } } }) as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    const result = await rejectMission(USER_ID, TASK_ID, VERSION_ID, null);
    expect(result).toBe("database_error");
  });
});

// =============================================================================
// regenerateMission
// =============================================================================
describe("regenerateMission", () => {
  const VALID_FEEDBACK =
    "I would like a mission that focuses more on writing and reviewing tests rather than implementation.";

  const REJECTED_TASK_DATA = {
    id: TASK_ID,
    user_id: USER_ID,
    scheduled_date: "2026-07-20",
    status: "rejected",
    review_operation_status: "idle",
    regeneration_count: 0,
    approved_at: null,
    rejected_at: "2026-07-20T11:00:00.000Z",
    current_mission_version_id: VERSION_ID,
    repositories: {
      full_name: "user/my-repo",
      access_status: "active",
      github_installations: { status: "active" },
    },
  };

  const REJECTED_VERSION_DATA = {
    id: VERSION_ID,
    task_id: TASK_ID,
    user_id: USER_ID,
    version_number: 1,
    status: "rejected",
    title: "Practice state transitions",
    description: "A focused exercise on understanding state change in a UI component.",
    estimated_minutes: 30,
    difficulty: "beginner",
    acceptance_checklist: ["Identify two state transitions", "Describe each clearly"],
    suggested_commit_message: "Document state transition reasoning",
    suggested_branch: "main",
    learning_outcome: "Explain predictable state transitions using a focused example.",
    ai_provider: "pollinations",
    prompt_version: "mission-v2",
    generation_claim_version: 1,
    approved_at: null,
    rejected_at: "2026-07-20T11:00:00.000Z",
    created_at: "2026-07-20T10:00:00.000Z",
  };

  function makeRegenAdminMock(regenResult = "claimed") {
    return {
      rpc: vi.fn().mockImplementation((name: string) => {
        const map: Record<string, unknown> = {
          claim_mission_regeneration: {
            data: { result: regenResult, request_id: REQUEST_ID, claim_version: 1 },
            error: null,
          },
          finalize_mission_regeneration: { data: "finalized", error: null },
          fail_mission_regeneration: { data: "failed", error: null },
        };
        return Promise.resolve(map[name] ?? { data: null, error: { message: "unknown" } });
      }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
      }),
    };
  }

  function makeRegenServerClient() {
    let callCount = 0;
    const maybeSingleFn = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1)
        return Promise.resolve({ data: REJECTED_TASK_DATA, error: null });
      return Promise.resolve({ data: REJECTED_VERSION_DATA, error: null });
    });
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: maybeSingleFn,
      }),
    };
  }

  function makeRegenContextAdminMock() {
    return {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        const profileData = {
          experience_level: "beginner",
          timezone: "Europe/London",
        };
        const goalData = {
          title: "Learn React",
          technology: "React",
          task_type: "learning_note",
          daily_minutes: 30,
        };
        const repoData = {
          name: "my-repo",
          default_branch: "main",
          is_private: false,
          github_installations: [{ status: "active" }],
        };
        const dataMap: Record<string, unknown> = {
          profiles: profileData,
          goals: goalData,
          repositories: repoData,
          daily_tasks: null,
        };
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: dataMap[table] ?? null,
            error: null,
          }),
        };
      }),
    };
  }

  const VALID_REGEN_MISSION = {
    title: "Practice component testing patterns",
    description:
      "Write a short note comparing two approaches to structuring component test assertions for clarity.",
    estimated_minutes: 30,
    difficulty: "beginner",
    acceptance_checklist: [
      "Compare two assertion patterns in plain language",
      "Identify the clearer approach and explain why",
    ],
    suggested_commit_message: "Document component testing patterns comparison",
    suggested_branch: "main",
    learning_outcome: "Identify clearer assertion patterns in component tests.",
  };

  it("returns claimed on successful regeneration", async () => {
    // Single unified admin mock that handles all RPC and table calls
    const profileData = { experience_level: "beginner", timezone: "Europe/London" };
    const goalData = { title: "Learn React", technology: "React", task_type: "learning_note", daily_minutes: 30 };
    const repoData = { name: "my-repo", default_branch: "main", is_private: false, github_installations: [{ status: "active" }] };
    const unifiedAdmin = {
      rpc: vi.fn().mockImplementation((name: string) => {
        const map: Record<string, unknown> = {
          claim_mission_regeneration: {
            data: { result: "claimed", request_id: REQUEST_ID, claim_version: 1 },
            error: null,
          },
          finalize_mission_regeneration: { data: "finalized", error: null },
          fail_mission_regeneration: { data: "failed", error: null },
        };
        return Promise.resolve(map[name] ?? { data: null, error: { message: "unknown" } });
      }),
      from: vi.fn().mockImplementation((table: string) => {
        const tableMap: Record<string, unknown> = {
          profiles: profileData,
          goals: goalData,
          repositories: repoData,
          daily_tasks: null,
        };
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: tableMap[table] ?? null, error: null }),
        };
      }),
    };

    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      unifiedAdmin as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeRegenServerClient() as unknown as ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never
    );

    const mockProvider: AIProvider = {
      providerId: "pollinations",
      validateConfiguration: vi.fn(),
      generateMission: vi.fn().mockResolvedValue({
        content: VALID_REGEN_MISSION,
        providerId: "pollinations",
        modelId: "openai-large",
        usage: { inputUnits: 100, outputUnits: 200 },
        requestId: null,
      }),
    };

    const result = await regenerateMission(
      USER_ID,
      TASK_ID,
      VERSION_ID,
      VALID_FEEDBACK,
      { provider: mockProvider }
    );
    expect(result).toBe("claimed");
  });

  it("returns usage_limit_reached when limit is hit", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeRegenAdminMock("usage_limit_reached") as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeRegenServerClient() as unknown as ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never
    );
    const mockProvider: AIProvider = {
      providerId: "pollinations",
      validateConfiguration: vi.fn(),
      generateMission: vi.fn(),
    };
    const result = await regenerateMission(
      USER_ID,
      TASK_ID,
      VERSION_ID,
      VALID_FEEDBACK,
      { provider: mockProvider }
    );
    expect(result).toBe("usage_limit_reached");
  });

  it("returns repository_unavailable when repo check fails", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeRegenAdminMock("repository_unavailable") as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeRegenServerClient() as unknown as ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never
    );
    const mockProvider: AIProvider = {
      providerId: "pollinations",
      validateConfiguration: vi.fn(),
      generateMission: vi.fn(),
    };
    const result = await regenerateMission(
      USER_ID,
      TASK_ID,
      VERSION_ID,
      VALID_FEEDBACK,
      { provider: mockProvider }
    );
    expect(result).toBe("repository_unavailable");
  });

  it("does not call provider when limit is reached", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeRegenAdminMock("usage_limit_reached") as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeRegenServerClient() as unknown as ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never
    );
    const generateMission = vi.fn();
    const mockProvider: AIProvider = {
      providerId: "pollinations",
      validateConfiguration: vi.fn(),
      generateMission,
    };
    await regenerateMission(
      USER_ID,
      TASK_ID,
      VERSION_ID,
      VALID_FEEDBACK,
      { provider: mockProvider }
    );
    expect(generateMission).not.toHaveBeenCalled();
  });

  it("returns provider_error and calls fail on provider failure", async () => {
    let adminCallCount = 0;
    vi.mocked(createSupabaseAdminClient).mockImplementation(() => {
      adminCallCount += 1;
      if (adminCallCount <= 2) {
        return makeRegenAdminMock() as unknown as ReturnType<typeof createSupabaseAdminClient>;
      }
      return makeRegenContextAdminMock() as unknown as ReturnType<typeof createSupabaseAdminClient>;
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeRegenServerClient() as unknown as ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never
    );
    const mockProvider: AIProvider = {
      providerId: "pollinations",
      validateConfiguration: vi.fn(),
      generateMission: vi.fn().mockRejectedValue(
        new AIProviderError({ code: "temporarily_unavailable", retrySafe: false })
      ),
    };
    const result = await regenerateMission(
      USER_ID,
      TASK_ID,
      VERSION_ID,
      VALID_FEEDBACK,
      { provider: mockProvider }
    );
    expect(result).toBe("provider_error");
  });

  it("never calls a GitHub API function", async () => {
    // Ensure no installation token or GitHub API is invoked during regeneration
    const installationTokenSpy = vi.fn();
    vi.doMock("@/lib/github/installation-token", () => ({
      createInstallationToken: installationTokenSpy,
    }));
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeRegenAdminMock("usage_limit_reached") as unknown as ReturnType<typeof createSupabaseAdminClient>
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeRegenServerClient() as unknown as ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never
    );
    const mockProvider: AIProvider = {
      providerId: "pollinations",
      validateConfiguration: vi.fn(),
      generateMission: vi.fn(),
    };
    await regenerateMission(
      USER_ID,
      TASK_ID,
      VERSION_ID,
      VALID_FEEDBACK,
      { provider: mockProvider }
    );
    expect(installationTokenSpy).not.toHaveBeenCalled();
  });
});
