import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPaginate, mockListEndpoint } = vi.hoisted(() => ({
  mockPaginate: vi.fn(),
  mockListEndpoint: vi.fn(),
}));

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
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    paginate: mockPaginate,
    rest: { apps: { listReposAccessibleToInstallation: mockListEndpoint } },
  })),
}));

import { Octokit } from "@octokit/rest";
import { listInstallationRepositories } from "@/lib/github/repository-list";

function githubRepository(id: number) {
  return {
    id,
    name: `repo-${id}`,
    full_name: `owner/repo-${id}`,
    owner: { login: "owner", extra: "discarded" },
    private: id % 2 === 0,
    default_branch: id % 2 === 0 ? "develop" : "main",
    description: "discarded",
  };
}

describe("listInstallationRepositories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists and normalizes repositories for a valid token", async () => {
    mockPaginate.mockResolvedValueOnce([githubRepository(1)]);

    const result = await listInstallationRepositories("ghs_token", 12345);

    expect(result).toEqual({
      ok: true,
      repositories: [
        {
          id: 1,
          name: "repo-1",
          full_name: "owner/repo-1",
          owner: { login: "owner" },
          private: false,
          default_branch: "main",
        },
      ],
    });
    expect(Octokit).toHaveBeenCalledWith({ auth: "ghs_token" });
    expect(mockPaginate).toHaveBeenCalledWith(mockListEndpoint, {
      per_page: 100,
    });
  });

  it("returns an empty list when the installation has no repositories", async () => {
    mockPaginate.mockResolvedValueOnce([]);

    await expect(
      listInstallationRepositories("ghs_token", 12345)
    ).resolves.toEqual({ ok: true, repositories: [] });
  });

  it("maps GitHub API errors to GITHUB_UNAVAILABLE", async () => {
    mockPaginate.mockRejectedValueOnce(new Error("rate limited"));

    await expect(
      listInstallationRepositories("ghs_token", 12345)
    ).resolves.toEqual({ ok: false, errorCode: "GITHUB_UNAVAILABLE" });
  });

  it("collects all repositories returned across paginated responses", async () => {
    const allRepositories = Array.from({ length: 201 }, (_, index) =>
      githubRepository(index + 1)
    );
    mockPaginate.mockResolvedValueOnce(allRepositories);

    const result = await listInstallationRepositories("ghs_token", 12345);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repositories).toHaveLength(201);
      expect(result.repositories.at(-1)?.id).toBe(201);
    }
    expect(mockPaginate).toHaveBeenCalledTimes(1);
  });
});
