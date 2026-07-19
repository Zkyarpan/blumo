import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

vi.mock("server-only", () => ({}));

describe("getInstallationById", () => {
  let mockGetInstallation: ReturnType<typeof vi.fn>;
  let mockOctokit: Partial<Octokit>;

  beforeEach(() => {
    vi.resetModules();
    mockGetInstallation = vi.fn();
    mockOctokit = {
      rest: {
        apps: {
          getInstallation: mockGetInstallation,
        },
      } as unknown as Octokit["rest"],
    };
  });

  it("returns a typed GitHubInstallation for a valid User installation", async () => {
    mockGetInstallation.mockResolvedValue({
      data: {
        id: 12345,
        account: {
          id: 9876543,
          login: "testuser",
          type: "User",
        },
      },
    });

    const { getInstallationById } = await import("./installation-lookup");
    const result = await getInstallationById(mockOctokit as Octokit, 12345);

    expect(result).toEqual({
      id: 12345,
      account: {
        id: 9876543,
        login: "testuser",
        type: "User",
      },
    });
  });

  it("returns null when GitHub API returns 404", async () => {
    mockGetInstallation.mockRejectedValue({ status: 404, message: "Not Found" });

    const { getInstallationById } = await import("./installation-lookup");
    const result = await getInstallationById(mockOctokit as Octokit, 99999);

    expect(result).toBeNull();
  });

  it("rethrows error when GitHub API returns a non-404 error", async () => {
    const networkError = { status: 500, message: "Internal Server Error" };
    mockGetInstallation.mockRejectedValue(networkError);

    const { getInstallationById } = await import("./installation-lookup");

    await expect(
      getInstallationById(mockOctokit as Octokit, 12345)
    ).rejects.toEqual(networkError);
  });

  it("returns null when the account has no login field", async () => {
    mockGetInstallation.mockResolvedValue({
      data: {
        id: 12345,
        account: {
          id: 9876543,
          // no 'login' field
          type: "User",
        },
      },
    });

    const { getInstallationById } = await import("./installation-lookup");
    const result = await getInstallationById(mockOctokit as Octokit, 12345);

    expect(result).toBeNull();
  });
});
