import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("server-only", () => ({}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

const USER_ID = "user-test-123";

const PROFILE = {
  id: USER_ID,
  display_name: "Arpan Karki",
  github_username: "arpankarki",
  avatar_url: "https://github.com/arpankarki.png",
  experience_level: "beginner",
  timezone: "UTC",
  onboarding_completed_at: "2024-01-01T00:00:00Z",
};

const GOAL = {
  id: "goal-1",
  title: "Get a junior React job",
  technology: "React",
  task_type: "learning_note",
  daily_minutes: 30,
  status: "active",
  created_at: "2024-01-01T00:00:00Z",
};

const INSTALLATION = { id: "installation-1", status: "active" };

const REPOSITORY = {
  id: "repository-1",
  full_name: "arpankarki/blumo-notes",
  default_branch: "develop",
};

/**
 * Builds a fully-chainable mock Supabase client for the three queries
 * getDashboardData issues: profiles (maybeSingle), goals (maybeSingle),
 * and daily_tasks (count via select+eq+eq).
 */
function buildMockClient(opts: {
  profile?: { data: typeof PROFILE | null; error: null | { message: string } };
  goal?: { data: typeof GOAL | null; error: null | { message: string } };
  taskCount?: { count: number | null; error: null | { message: string } };
  installation?: {
    data: typeof INSTALLATION | null;
    error: null | { message: string };
  };
  repository?: {
    data: typeof REPOSITORY | null;
    error: null | { message: string };
  };
}) {
  const {
    profile = { data: PROFILE, error: null },
    goal = { data: GOAL, error: null },
    taskCount = { count: 3, error: null },
    installation = { data: INSTALLATION, error: null },
    repository = { data: REPOSITORY, error: null },
  } = opts;

  // Profile chain: .from("profiles").select().eq().maybeSingle()
  const profileChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(profile),
  };

  // Goal chain: .from("goals").select().eq().eq().limit().maybeSingle()
  const goalChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(goal),
  };

  // Task count chain: .from("daily_tasks").select(...,{count}).eq().eq() → resolves
  // The select returns something that can chain two .eq() calls and finally resolves.
  const taskCountChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  };
  // Override: the second .eq() call resolves with the task count result
  let taskEqCallCount = 0;
  taskCountChain.eq = vi.fn().mockImplementation(() => {
    taskEqCallCount++;
    if (taskEqCallCount >= 2) {
      taskEqCallCount = 0; // reset for test isolation
      return Promise.resolve(taskCount);
    }
    return taskCountChain;
  });

  const installationChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(installation),
  };

  const repositoryChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(repository),
  };

  const fromFn = vi.fn().mockImplementation((table: string) => {
    if (table === "profiles") return profileChain;
    if (table === "goals") return goalChain;
    if (table === "daily_tasks") return taskCountChain;
    if (table === "github_installations") return installationChain;
    if (table === "repositories") return repositoryChain;
    return profileChain;
  });

  return { from: fromFn };
}

describe("getDashboardData", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("1. returns DashboardData with completedTaskCount: 3 when profile, goal, and tasks exist", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({ taskCount: { count: 3, error: null } }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result).not.toBeNull();
    expect(result?.profile.id).toBe(USER_ID);
    expect(result?.activeGoal?.title).toBe("Get a junior React job");
    expect(result?.completedTaskCount).toBe(3);
    expect(result?.installationStatus).toBe("active");
    expect(result?.selectedRepository).toEqual(REPOSITORY);
  });

  it("2. returns DashboardData with activeGoal: null when no active goal exists", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({ goal: { data: null, error: null } }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result).not.toBeNull();
    expect(result?.activeGoal).toBeNull();
    expect(result?.profile.id).toBe(USER_ID);
  });

  it("3. returns null when profile does not exist (Supabase returns null for profile)", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({ profile: { data: null, error: null } }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result).toBeNull();
  });

  it("4. returns null when Supabase throws on the profile query (createClient throws)", async () => {
    vi.mocked(createSupabaseServerClient).mockImplementation(() => {
      throw new Error("connection refused");
    });

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result).toBeNull();
  });

  it("5. returns completedTaskCount: 0 when no committed tasks exist", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({ taskCount: { count: 0, error: null } }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result).not.toBeNull();
    expect(result?.completedTaskCount).toBe(0);
  });

  it("6. returns activeGoal: null and completedTaskCount: 0 when goal query errors", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({
        goal: { data: null, error: { message: "goal query failed" } },
        taskCount: { count: 0, error: null },
      }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result).not.toBeNull();
    expect(result?.activeGoal).toBeNull();
    expect(result?.completedTaskCount).toBe(0);
  });

  it("7. returns a connected installation without a selected repository", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({ repository: { data: null, error: null } }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result?.installationStatus).toBe("active");
    expect(result?.selectedRepository).toBeNull();
  });

  it("8. returns the disconnected state when no active installation exists", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({ installation: { data: null, error: null } }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result?.installationStatus).toBeNull();
    expect(result?.selectedRepository).toBeNull();
  });

  it("9. returns suspended status without presenting a selected repository", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({
        installation: {
          data: { id: "installation-1", status: "suspended" },
          error: null,
        },
      }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result?.installationStatus).toBe("suspended");
    expect(result?.selectedRepository).toBeNull();
  });

  it("10. returns uninstalled status as disconnected without a repository", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({
        installation: {
          data: { id: "installation-1", status: "uninstalled" },
          error: null,
        },
      }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    const result = await getDashboardData(USER_ID);

    expect(result?.installationStatus).toBe("uninstalled");
    expect(result?.selectedRepository).toBeNull();
  });

  it("11. returns null rather than fabricating connection state on installation query failure", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      buildMockClient({
        installation: {
          data: null,
          error: { message: "installation query failed" },
        },
      }) as never
    );

    const { getDashboardData } = await import("./dashboard.service");
    await expect(getDashboardData(USER_ID)).resolves.toBeNull();
  });
});
