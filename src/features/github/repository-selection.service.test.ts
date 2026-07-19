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
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { selectRepository } from "@/features/github/repository-selection.service";

const mockCreateAdminClient = vi.mocked(createSupabaseAdminClient);

const REPOSITORY = {
  id: "repository-row-2",
  installation_id: "installation-row-1",
  full_name: "owner/beta",
  default_branch: "develop",
  access_status: "active",
};

type QueryResult = { data?: unknown; error?: unknown };

function makeChain(result: QueryResult) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: Promise<QueryResult>["then"];
  } = {};

  for (const method of [
    "select",
    "eq",
    "update",
    "in",
    "insert",
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
}

function successChains(options?: {
  previousSelections?: { id: string }[];
  clearError?: unknown;
  auditError?: unknown;
}) {
  const clearChain = makeChain({
    data: null,
    error: options?.clearError ?? null,
  });
  const selectChain = makeChain({
    data: { id: "repository-row-2" },
    error: null,
  });
  const auditChain = makeChain({
    data: null,
    error: options?.auditError ?? null,
  });

  return {
    clearChain,
    selectChain,
    auditChain,
    chains: [
      makeChain({ data: REPOSITORY, error: null }),
      makeChain({ data: { id: "installation-row-1" }, error: null }),
      makeChain({ data: options?.previousSelections ?? [], error: null }),
      clearChain,
      selectChain,
      auditChain,
    ],
  };
}

describe("selectRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("selects a valid repository and records a sanitized audit event", async () => {
    const arranged = successChains();
    useAdminChains(...arranged.chains);

    const result = await selectRepository("repository-row-2", "user-1");

    expect(result).toEqual({ ok: true, repositoryId: "repository-row-2" });
    expect(arranged.selectChain.update).toHaveBeenCalledWith({
      is_selected: true,
    });
    expect(arranged.auditChain.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      action: "repository_selected",
      resource_type: "repository",
      resource_id: "repository-row-2",
      metadata: { full_name: "owner/beta", default_branch: "develop" },
    });
  });

  it("returns REPOSITORY_NOT_FOUND for another user's repository", async () => {
    useAdminChains(makeChain({ data: null, error: null }));

    await expect(
      selectRepository("other-user-repository", "user-1")
    ).resolves.toEqual({ ok: false, errorCode: "REPOSITORY_NOT_FOUND" });
  });

  it("rejects a removed repository", async () => {
    useAdminChains(
      makeChain({
        data: { ...REPOSITORY, access_status: "removed" },
        error: null,
      })
    );

    await expect(
      selectRepository("repository-row-2", "user-1")
    ).resolves.toEqual({ ok: false, errorCode: "REPOSITORY_REMOVED" });
  });

  it("rejects an unavailable repository", async () => {
    useAdminChains(
      makeChain({
        data: { ...REPOSITORY, access_status: "unavailable" },
        error: null,
      })
    );

    await expect(
      selectRepository("repository-row-2", "user-1")
    ).resolves.toEqual({
      ok: false,
      errorCode: "REPOSITORY_NOT_ACCESSIBLE",
    });
  });

  it("rejects a repository whose installation is suspended", async () => {
    useAdminChains(
      makeChain({ data: REPOSITORY, error: null }),
      makeChain({ data: null, error: null })
    );

    await expect(
      selectRepository("repository-row-2", "user-1")
    ).resolves.toEqual({
      ok: false,
      errorCode: "REPOSITORY_NOT_ACCESSIBLE",
    });
  });

  it("clears the previous selection before selecting a new repository", async () => {
    const arranged = successChains({
      previousSelections: [{ id: "repository-row-1" }],
    });
    useAdminChains(...arranged.chains);

    const result = await selectRepository("repository-row-2", "user-1");

    expect(result.ok).toBe(true);
    expect(arranged.clearChain.update).toHaveBeenCalledWith({
      is_selected: false,
    });
    expect(arranged.clearChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(arranged.clearChain.eq).toHaveBeenCalledWith("is_selected", true);
    expect(
      arranged.clearChain.update.mock.invocationCallOrder[0]
    ).toBeLessThan(arranged.selectChain.update.mock.invocationCallOrder[0]);
  });

  it("returns DB_ERROR when clearing the previous selection fails", async () => {
    const arranged = successChains({ clearError: { message: "write failed" } });
    useAdminChains(...arranged.chains.slice(0, 4));

    await expect(
      selectRepository("repository-row-2", "user-1")
    ).resolves.toEqual({ ok: false, errorCode: "DB_ERROR" });
    expect(arranged.selectChain.update).not.toHaveBeenCalled();
  });

  it("keeps a successful selection when audit logging fails", async () => {
    const arranged = successChains({
      auditError: { message: "audit unavailable" },
    });
    useAdminChains(...arranged.chains);

    await expect(
      selectRepository("repository-row-2", "user-1")
    ).resolves.toEqual({ ok: true, repositoryId: "repository-row-2" });
  });

  it("rejects a repository removed between validation and the selection update", async () => {
    const arranged = successChains({
      previousSelections: [{ id: "repository-row-1" }],
    });
    const concurrentRemovalChain = makeChain({ data: null, error: null });
    useAdminChains(
      arranged.chains[0],
      arranged.chains[1],
      arranged.chains[2],
      arranged.clearChain,
      concurrentRemovalChain,
      makeChain({ data: null, error: null })
    );

    await expect(
      selectRepository("repository-row-2", "user-1")
    ).resolves.toEqual({
      ok: false,
      errorCode: "REPOSITORY_NOT_ACCESSIBLE",
    });
  });
});
