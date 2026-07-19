import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies — no real Supabase credentials needed
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("server-only", () => ({}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
const mockedCreateClient = vi.mocked(createSupabaseServerClient);

/** Re-usable valid onboarding input */
const VALID_INPUT = {
  title: "Get a junior React developer job",
  technology: "React",
  experience_level: "beginner" as const,
  daily_minutes: 30 as const,
  task_type: "learning_note" as const,
  timezone: "UTC",
};

const USER_ID = "user-abc-123";

/**
 * Build a mock Supabase client with chainable query builder behaviour.
 * Each call to `.from()` → `.select()` → `.eq()` → `.maybeSingle()` or
 * `.single()` resolves to the provided value.
 * Similarly `.from()` → `.update()` → `.eq()` and `.from()` → `.insert()`
 * resolve to the provided value.
 */
function buildMockClient(overrides: {
  existingGoal?: { data: { id: string } | null; error: null };
  profile?: { data: { onboarding_completed_at: string | null } | null; error: null };
  profileUpdate?: { error: null | { message: string } };
  goalInsert?: { error: null | { message: string } };
  completeSentinel?: { error: null | { message: string } };
}) {
  const {
    existingGoal = { data: null, error: null },
    profile = { data: { onboarding_completed_at: null }, error: null },
    profileUpdate = { error: null },
    goalInsert = { error: null },
    completeSentinel = { error: null },
  } = overrides;

  // Track how many times .update() has been called so we return the
  // correct mock for "update profile prefs" vs "complete sentinel"
  let updateCallCount = 0;

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(existingGoal),
          }),
          maybeSingle: vi.fn().mockResolvedValue(existingGoal),
          single: vi.fn().mockResolvedValue(profile),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation(() => {
          updateCallCount += 1;
          // First update = profile prefs; second update = sentinel
          return Promise.resolve(
            updateCallCount === 1 ? profileUpdate : completeSentinel
          );
        }),
      }),
      insert: vi.fn().mockResolvedValue(goalInsert),
    }),
  };
}

describe("saveOnboarding service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("1. returns { ok: true, data: null } when no existing goal and all writes succeed", async () => {
    mockedCreateClient.mockResolvedValue(
      buildMockClient({}) as never
    );

    const { saveOnboarding } = await import("./onboarding.service");
    const result = await saveOnboarding(USER_ID, VALID_INPUT);

    expect(result).toEqual({ ok: true, data: null });
  });

  it("2. returns ok: false with DB_ERROR when profile UPDATE fails", async () => {
    mockedCreateClient.mockResolvedValue(
      buildMockClient({
        profileUpdate: { error: { message: "db error" } },
      }) as never
    );

    const { saveOnboarding } = await import("./onboarding.service");
    const result = await saveOnboarding(USER_ID, VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DB_ERROR");
    }
  });

  it("3. returns ok: false with DB_ERROR when goal INSERT fails", async () => {
    mockedCreateClient.mockResolvedValue(
      buildMockClient({
        goalInsert: { error: { message: "insert failed" } },
      }) as never
    );

    const { saveOnboarding } = await import("./onboarding.service");
    const result = await saveOnboarding(USER_ID, VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DB_ERROR");
    }
  });

  it("4. when active goal exists and onboarding_completed_at is null, completes sentinel and returns ok: true", async () => {
    // existingGoal is truthy → goes into the duplicate-goal branch.
    // profile.onboarding_completed_at is null → completes the sentinel.
    const mockClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn()
        .mockResolvedValueOnce({ data: { id: "goal-1" }, error: null })   // existingGoal query
        ,
      single: vi.fn()
        .mockResolvedValueOnce({ data: { onboarding_completed_at: null }, error: null }) // profile query
        ,
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    };

    // Override the final sentinel update to succeed
    const completeFn = vi.fn().mockResolvedValue({ error: null });
    mockClient.update.mockReturnValue({ eq: completeFn });

    // Build a proper multi-call chain for the select queries
    const goals_chain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "goal-1" }, error: null }),
          }),
        }),
      }),
    };
    const profile_chain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { onboarding_completed_at: null },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "goals") return goals_chain;
      return profile_chain;
    });

    mockedCreateClient.mockResolvedValue({ from: fromFn } as never);

    const { saveOnboarding } = await import("./onboarding.service");
    const result = await saveOnboarding(USER_ID, VALID_INPUT);

    expect(result).toEqual({ ok: true, data: null });
  });

  it("5. when active goal exists and onboarding_completed_at is set, returns ALREADY_ONBOARDED error", async () => {
    const goals_chain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "goal-1" }, error: null }),
          }),
        }),
      }),
    };
    const profile_chain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { onboarding_completed_at: "2024-01-01T00:00:00Z" },
            error: null,
          }),
        }),
      }),
    };

    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "goals") return goals_chain;
      return profile_chain;
    });

    mockedCreateClient.mockResolvedValue({ from: fromFn } as never);

    const { saveOnboarding } = await import("./onboarding.service");
    const result = await saveOnboarding(USER_ID, VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ALREADY_ONBOARDED");
    }
  });
});

// ── Action-level test for unauthenticated case ─────────────────────────────
vi.mock("@/features/auth/get-user", () => ({
  getUser: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { getUser } from "@/features/auth/get-user";
const mockedGetUser = vi.mocked(getUser);

describe("submitOnboarding action — unauthenticated", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("6. returns UNAUTHENTICATED error when called without a session", async () => {
    mockedGetUser.mockResolvedValue(null);

    const { submitOnboarding } = await import("./onboarding.actions");

    const formData = new FormData();
    formData.set("title", "Test goal for the developer");
    formData.set("technology", "React");
    formData.set("experience_level", "beginner");
    formData.set("daily_minutes", "30");
    formData.set("task_type", "learning_note");
    formData.set("timezone", "UTC");

    const result = await submitOnboarding({ ok: true, data: null }, formData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNAUTHENTICATED");
    }
  });
});
