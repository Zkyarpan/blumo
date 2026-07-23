import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/github/installation-token", () => ({
  createInstallationToken: vi.fn(),
}));
vi.mock("@/lib/github/commit-file", () => ({
  getRefSha: vi.fn(),
  checkBranchExists: vi.fn(),
  checkExistingFile: vi.fn(),
  createBranch: vi.fn(),
  commitFile: vi.fn(),
}));

import {
  buildCommitProposal,
  executeCommit,
} from "@/features/commits/commit-proposal.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createInstallationToken } from "@/lib/github/installation-token";
import {
  getRefSha,
  checkBranchExists,
  checkExistingFile,
  createBranch,
  commitFile,
} from "@/lib/github/commit-file";

// --------------------------------------------------------------------------
// Shared test data
// --------------------------------------------------------------------------

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VERSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REPO_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INSTALL_UUID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function makeTaskRow() {
  return {
    id: TASK_ID,
    user_id: USER_ID,
    scheduled_date: "2026-07-20",
    status: "approved",
    current_mission_version_id: VERSION_ID,
    repository_id: REPO_ID,
    repositories: {
      full_name: "testuser/test-repo",
      default_branch: "main",
      access_status: "active",
      installation_id: INSTALL_UUID,
      github_installations: {
        id: INSTALL_UUID,
        installation_id: 12345678,
        status: "active",
      },
    },
  };
}

function makeVersionRow() {
  return {
    id: VERSION_ID,
    task_id: TASK_ID,
    user_id: USER_ID,
    version_number: 1,
    status: "approved",
    title: "Practice State Transitions",
    description: "A focused exercise on state management.",
    acceptance_checklist: ["Identify two transitions", "Describe each clearly"],
    suggested_commit_message: "Document state transition reasoning",
    learning_outcome: "Explain predictable state transitions.",
    ai_provider: "pollinations",
  };
}

function makeServerClient(taskOverride = {}, versionOverride = {}) {
  const task = { ...makeTaskRow(), ...taskOverride };
  const version = { ...makeVersionRow(), ...versionOverride };

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: table === "daily_tasks" ? task : version,
        error: null,
      }),
    })),
  };
}

function makeAdminClient(rpcResult = "committed") {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: "not found" }),
    })),
  };
}

/** Sets up the standard happy-path GitHub mocks (branch does not yet exist). */
function mockGitHubHappyPath() {
  vi.mocked(createInstallationToken).mockResolvedValue({
    ok: true,
    token: "test-token",
  });
  vi.mocked(getRefSha).mockResolvedValue({ ok: true, sha: "abc123" });
  vi.mocked(checkBranchExists).mockResolvedValue({ ok: true, exists: false });
  vi.mocked(createBranch).mockResolvedValue({ ok: true });
  vi.mocked(checkExistingFile).mockResolvedValue({ ok: true, exists: false });
}

// --------------------------------------------------------------------------
// buildCommitProposal
// --------------------------------------------------------------------------

describe("buildCommitProposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a proposal for an approved task with valid fields", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    const result = await buildCommitProposal(USER_ID, TASK_ID);
    expect(result.kind).toBe("proposal");
    if (result.kind !== "proposal") return;
    expect(result.data.proposedBranch).toContain("blumo/");
    expect(result.data.proposedPath).toContain("blumo/");
    expect(result.data.proposedPath).toContain(".md");
    expect(result.data.commitMessage).toBe("Document state transition reasoning");
    expect(result.data.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("returns not_found when task does not exist", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      })),
    } as never);
    const result = await buildCommitProposal(USER_ID, TASK_ID);
    expect(result.kind).toBe("not_found");
  });

  it("returns not_approved for a generated task", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient({ status: "generated" }) as never
    );
    const result = await buildCommitProposal(USER_ID, TASK_ID);
    expect(result.kind).toBe("not_approved");
  });

  it("returns not_approved for a rejected task", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient({ status: "rejected" }) as never
    );
    const result = await buildCommitProposal(USER_ID, TASK_ID);
    expect(result.kind).toBe("not_approved");
  });

  it("returns repository_unavailable when repo is removed", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient({
        repositories: {
          ...makeTaskRow().repositories,
          access_status: "removed",
        },
      }) as never
    );
    const result = await buildCommitProposal(USER_ID, TASK_ID);
    expect(result.kind).toBe("repository_unavailable");
  });

  it("returns installation_suspended when installation is suspended", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient({
        repositories: {
          ...makeTaskRow().repositories,
          github_installations: {
            id: INSTALL_UUID,
            installation_id: 12345678,
            status: "suspended",
          },
        },
      }) as never
    );
    const result = await buildCommitProposal(USER_ID, TASK_ID);
    expect(result.kind).toBe("installation_suspended");
  });

  it("returns proposal with correct branch format", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    const result = await buildCommitProposal(USER_ID, TASK_ID);
    expect(result.kind).toBe("proposal");
    if (result.kind !== "proposal") return;
    expect(result.data.proposedBranch).toBe(
      "blumo/2026-07-20-practice-state-transitions"
    );
    expect(result.data.proposedPath).toBe(
      "blumo/2026-07-20-practice-state-transitions.md"
    );
  });
});

// --------------------------------------------------------------------------
// executeCommit — returns { code, ...details } on success
// --------------------------------------------------------------------------

describe("executeCommit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits successfully when branch does not yet exist", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeAdminClient("committed") as never
    );
    mockGitHubHappyPath();
    vi.mocked(commitFile).mockResolvedValue({
      ok: true,
      commitSha: "sha123",
      commitUrl: "https://github.com/test",
      commitMessage: "Document state transition reasoning",
    });

    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("committed");
    if ("commitSha" in result) {
      expect(result.commitSha).toBe("sha123");
      expect(result.commitUrl).toBe("https://github.com/test");
      expect(result.branch).toContain("blumo/");
      expect(result.filePath).toContain("blumo/");
      expect(result.repositoryFullName).toBe("testuser/test-repo");
    }
  });

  it("commits successfully when mission branch already exists (retry scenario)", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeAdminClient("committed") as never
    );
    vi.mocked(createInstallationToken).mockResolvedValue({
      ok: true,
      token: "test-token",
    });
    vi.mocked(getRefSha).mockResolvedValue({ ok: true, sha: "abc123" });
    // Branch already exists — should NOT call createBranch
    vi.mocked(checkBranchExists).mockResolvedValue({
      ok: true,
      exists: true,
      sha: "existing-sha",
    });
    vi.mocked(checkExistingFile).mockResolvedValue({ ok: true, exists: false });
    vi.mocked(commitFile).mockResolvedValue({
      ok: true,
      commitSha: "sha456",
      commitUrl: "https://github.com/test",
      commitMessage: "Document state transition reasoning",
    });

    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("committed");
    // createBranch must NOT have been called — branch already existed
    expect(createBranch).not.toHaveBeenCalled();
  });

  it("returns code=already_committed when DB says already committed", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeAdminClient("already_committed") as never
    );
    mockGitHubHappyPath();
    vi.mocked(commitFile).mockResolvedValue({
      ok: true,
      commitSha: "sha123",
      commitUrl: "https://github.com/test",
      commitMessage: "msg",
    });

    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("already_committed");
  });

  it("returns code=not_found when task does not exist", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      })),
    } as never);
    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("not_found");
  });

  it("returns code=invalid_transition for a generated task", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient({ status: "generated" }) as never
    );
    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("invalid_transition");
  });

  it("returns code=repository_unavailable when repo is removed", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient({
        repositories: {
          ...makeTaskRow().repositories,
          access_status: "removed",
        },
      }) as never
    );
    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("repository_unavailable");
  });

  it("returns code=installation_suspended when installation is suspended", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient({
        repositories: {
          ...makeTaskRow().repositories,
          github_installations: {
            id: INSTALL_UUID,
            installation_id: 12345678,
            status: "suspended",
          },
        },
      }) as never
    );
    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("installation_suspended");
  });

  it("returns code=github_unavailable when token generation fails", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    vi.mocked(createInstallationToken).mockResolvedValue({
      ok: false,
      errorCode: "GITHUB_UNAVAILABLE",
    });
    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("github_unavailable");
  });

  it("returns code=github_unavailable when checkBranchExists fails", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    vi.mocked(createInstallationToken).mockResolvedValue({
      ok: true,
      token: "test-token",
    });
    vi.mocked(getRefSha).mockResolvedValue({ ok: true, sha: "abc123" });
    vi.mocked(checkBranchExists).mockResolvedValue({
      ok: false,
      reason: "github_unavailable",
    });
    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("github_unavailable");
  });

  it("returns code=permission_changed when GitHub returns 403 on file commit", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    mockGitHubHappyPath();
    vi.mocked(commitFile).mockResolvedValue({
      ok: false,
      reason: "permission_changed",
    });
    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("permission_changed");
  });

  it("never calls GitHub API when preconditions fail", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient({ status: "generated" }) as never
    );
    await executeCommit(USER_ID, TASK_ID);
    expect(createInstallationToken).not.toHaveBeenCalled();
    expect(getRefSha).not.toHaveBeenCalled();
    expect(commitFile).not.toHaveBeenCalled();
  });

  it("does not call any pull-request GitHub API endpoint", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeAdminClient("committed") as never
    );
    mockGitHubHappyPath();
    vi.mocked(commitFile).mockResolvedValue({
      ok: true,
      commitSha: "sha123",
      commitUrl: "https://github.com/test",
      commitMessage: "msg",
    });

    await executeCommit(USER_ID, TASK_ID);
    const callArgs = vi.mocked(commitFile).mock.calls;
    expect(callArgs.length).toBe(1);
  });

  it("returns code=invalid_branch when mission branch equals default branch", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient({
        repositories: {
          ...makeTaskRow().repositories,
          default_branch: "blumo/2026-07-20-practice-state-transitions",
        },
      }) as never
    );
    vi.mocked(createInstallationToken).mockResolvedValue({
      ok: true,
      token: "test-token",
    });
    const result = await executeCommit(USER_ID, TASK_ID);
    expect(result.code).toBe("invalid_branch");
  });

  it("checks existing file on the mission branch, not the default branch", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeServerClient() as never
    );
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeAdminClient("committed") as never
    );
    mockGitHubHappyPath();
    vi.mocked(commitFile).mockResolvedValue({
      ok: true,
      commitSha: "sha123",
      commitUrl: "https://github.com/test",
      commitMessage: "msg",
    });

    await executeCommit(USER_ID, TASK_ID);

    // checkExistingFile must be called with the mission branch ref, not default branch
    const calls = vi.mocked(checkExistingFile).mock.calls;
    expect(calls.length).toBe(1);
    const refArg = calls[0][4]; // 5th arg is `ref`
    expect(refArg).toContain("blumo/");
  });
});
