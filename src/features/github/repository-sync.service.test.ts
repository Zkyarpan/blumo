import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
    SUPABASE_SECRET_KEY: "test-service-key",
    GITHUB_APP_ID: "1234567",
    GITHUB_APP_SLUG: "blumo-development",
    GITHUB_APP_PRIVATE_KEY:
      "-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----\n",
  },
}));
vi.mock("@/lib/github/installation-token", () => ({
  createInstallationToken: vi.fn(),
}));
vi.mock("@/lib/github/repository-list", () => ({
  listInstallationRepositories: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { createInstallationToken } from "@/lib/github/installation-token";
import { listInstallationRepositories } from "@/lib/github/repository-list";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncRepositories } from "@/features/github/repository-sync.service";

const mockCreateToken = vi.mocked(createInstallationToken);
const mockListRepositories = vi.mocked(listInstallationRepositories);
const mockCreateAdminClient = vi.mocked(createSupabaseAdminClient);

const INSTALLATION = {
  id: "installation-row-1",
  installation_id: 12345,
  status: "active",
};

const GITHUB_REPOSITORIES = [
  {
    id: 101,
    name: "alpha",
    full_name: "owner/alpha",
    owner: { login: "owner" },
    private: true,
    default_branch: "develop",
  },
];

const SYNCED_REPOSITORIES = [
  {
    id: "repository-row-1",
    github_repository_id: 101,
    owner: "owner",
    name: "alpha",
    full_name: "owner/alpha",
    default_branch: "develop",
    is_private: true,
    is_selected: false,
    access_status: "active",
  },
];

type QueryResult = { data?: unknown; error?: unknown };

function makeChain(result: QueryResult) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: Promise<QueryResult>["then"];
  } = {};

  for (const method of [
    "select",
    "eq",
    "limit",
    "upsert",
    "update",
    "in",
    "insert",
    "neq",
    "order",
  ]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = (onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

function useAdminChains(...chains: ReturnType<typeof makeChain>[]) {
  const from = vi.fn().mockImplementation(() => {
    const next = chains.shift();
    if (!next) throw new Error("Unexpected Supabase query");
    return next;
  });
  mockCreateAdminClient.mockReturnValue({ from } as never);
  return from;
}

function arrangeGitHubSuccess() {
  mockCreateToken.mockResolvedValue({ ok: true, token: "ghs_short_lived" });
  mockListRepositories.mockResolvedValue({
    ok: true,
    repositories: GITHUB_REPOSITORIES,
  });
}

describe("syncRepositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns NO_ACTIVE_INSTALLATION when the user has no installation", async () => {
    useAdminChains(
      makeChain({ data: null, error: null }),
      makeChain({ data: null, error: null })
    );

    await expect(syncRepositories("user-1")).resolves.toEqual({
      ok: false,
      errorCode: "NO_ACTIVE_INSTALLATION",
    });
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it("returns INSTALLATION_SUSPENDED when only a suspended installation exists", async () => {
    useAdminChains(
      makeChain({ data: null, error: null }),
      makeChain({
        data: { ...INSTALLATION, status: "suspended" },
        error: null,
      })
    );

    await expect(syncRepositories("user-1")).resolves.toEqual({
      ok: false,
      errorCode: "INSTALLATION_SUSPENDED",
    });
  });

  it("upserts verified metadata and returns active repositories", async () => {
    arrangeGitHubSuccess();
    const installationChain = makeChain({ data: INSTALLATION, error: null });
    const upsertChain = makeChain({ data: null, error: null });
    const activeRowsChain = makeChain({
      data: [{ id: "repository-row-1", github_repository_id: 101 }],
      error: null,
    });
    const auditChain = makeChain({ data: null, error: null });
    const syncedRowsChain = makeChain({
      data: SYNCED_REPOSITORIES,
      error: null,
    });
    useAdminChains(
      installationChain,
      upsertChain,
      activeRowsChain,
      auditChain,
      syncedRowsChain
    );

    const result = await syncRepositories("user-1");

    expect(result).toEqual({ ok: true, repositories: SYNCED_REPOSITORIES });
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: "user-1",
          installation_id: "installation-row-1",
          github_repository_id: 101,
          owner: "owner",
          full_name: "owner/alpha",
          default_branch: "develop",
          is_private: true,
          access_status: "active",
        }),
      ],
      { onConflict: "user_id,github_repository_id" }
    );
    expect(upsertChain.upsert.mock.calls[0][0][0]).not.toHaveProperty(
      "is_selected"
    );
    expect(auditChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "repositories_synced",
        metadata: { repository_count: 1, removed_count: 0 },
      })
    );
  });

  it("marks repositories missing from GitHub as removed without deleting history", async () => {
    arrangeGitHubSuccess();
    const removedUpdateChain = makeChain({ data: null, error: null });
    useAdminChains(
      makeChain({ data: INSTALLATION, error: null }),
      makeChain({ data: null, error: null }),
      makeChain({
        data: [
          { id: "repository-row-1", github_repository_id: 101 },
          { id: "repository-row-2", github_repository_id: 202 },
        ],
        error: null,
      }),
      removedUpdateChain,
      makeChain({ data: null, error: null }),
      makeChain({ data: SYNCED_REPOSITORIES, error: null })
    );

    const result = await syncRepositories("user-1");

    expect(result.ok).toBe(true);
    expect(removedUpdateChain.update).toHaveBeenCalledWith({
      access_status: "removed",
      is_selected: false,
    });
    expect(removedUpdateChain.in).toHaveBeenCalledWith("id", [
      "repository-row-2",
    ]);
  });

  it("returns GITHUB_UNAVAILABLE when token generation fails", async () => {
    mockCreateToken.mockResolvedValueOnce({
      ok: false,
      errorCode: "GITHUB_UNAVAILABLE",
    });
    useAdminChains(makeChain({ data: INSTALLATION, error: null }));

    await expect(syncRepositories("user-1")).resolves.toEqual({
      ok: false,
      errorCode: "GITHUB_UNAVAILABLE",
    });
    expect(mockListRepositories).not.toHaveBeenCalled();
  });

  it("returns DB_ERROR when the repository upsert fails", async () => {
    arrangeGitHubSuccess();
    useAdminChains(
      makeChain({ data: INSTALLATION, error: null }),
      makeChain({ data: null, error: { message: "constraint failure" } })
    );

    await expect(syncRepositories("user-1")).resolves.toEqual({
      ok: false,
      errorCode: "DB_ERROR",
    });
  });

  it("is idempotent across repeated synchronization calls", async () => {
    arrangeGitHubSuccess();
    const firstUpsert = makeChain({ data: null, error: null });
    const secondUpsert = makeChain({ data: null, error: null });
    const successChains = (upsert: ReturnType<typeof makeChain>) => [
      makeChain({ data: INSTALLATION, error: null }),
      upsert,
      makeChain({
        data: [{ id: "repository-row-1", github_repository_id: 101 }],
        error: null,
      }),
      makeChain({ data: null, error: null }),
      makeChain({ data: SYNCED_REPOSITORIES, error: null }),
    ];
    useAdminChains(
      ...successChains(firstUpsert),
      ...successChains(secondUpsert)
    );

    const first = await syncRepositories("user-1");
    const second = await syncRepositories("user-1");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(firstUpsert.upsert).toHaveBeenCalledWith(expect.any(Array), {
      onConflict: "user_id,github_repository_id",
    });
    expect(secondUpsert.upsert).toHaveBeenCalledWith(expect.any(Array), {
      onConflict: "user_id,github_repository_id",
    });
  });
});
