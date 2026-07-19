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
    GITHUB_WEBHOOK_SECRET: undefined,
    GITHUB_APP_CLIENT_ID: undefined,
    GITHUB_APP_CLIENT_SECRET: undefined,
  },
}));
vi.mock("@/lib/github/app-auth", () => ({ createAppOctokit: vi.fn() }));

import { createAppOctokit } from "@/lib/github/app-auth";
import { createInstallationToken } from "@/lib/github/installation-token";

const mockCreateAppOctokit = vi.mocked(createAppOctokit);
const mockCreateToken = vi.fn();

describe("createInstallationToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAppOctokit.mockReturnValue({
      rest: { apps: { createInstallationAccessToken: mockCreateToken } },
    } as unknown as ReturnType<typeof createAppOctokit>);
  });

  it("returns only the short-lived token for a valid installation", async () => {
    mockCreateToken.mockResolvedValueOnce({
      data: {
        token: "ghs_short_lived",
        expires_at: "2026-07-19T12:00:00Z",
        permissions: { contents: "write" },
      },
    });

    await expect(createInstallationToken(12345)).resolves.toEqual({
      ok: true,
      token: "ghs_short_lived",
    });
    expect(mockCreateToken).toHaveBeenCalledWith({ installation_id: 12345 });
  });

  it("maps a GitHub 404 to INVALID_INSTALLATION", async () => {
    mockCreateToken.mockRejectedValueOnce({ status: 404 });

    await expect(createInstallationToken(99999)).resolves.toEqual({
      ok: false,
      errorCode: "INVALID_INSTALLATION",
    });
  });

  it("maps unexpected GitHub errors to GITHUB_UNAVAILABLE", async () => {
    mockCreateToken.mockRejectedValueOnce(new Error("network unavailable"));

    await expect(createInstallationToken(12345)).resolves.toEqual({
      ok: false,
      errorCode: "GITHUB_UNAVAILABLE",
    });
  });
});
