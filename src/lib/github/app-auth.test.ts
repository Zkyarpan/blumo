import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn() }));
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@/lib/github/github-app.config", () => ({
  getGitHubAppConfig: vi.fn().mockReturnValue({
    appId: 1234567,
    appSlug: "blumo-development",
    privateKey:
      "-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----\n",
    webhookSecret: undefined,
    clientId: undefined,
    clientSecret: undefined,
  }),
}));

describe("createAppOctokit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns an Octokit instance when called with valid config", async () => {
    const { createAppOctokit } = await import("./app-auth");
    const octokit = createAppOctokit();
    expect(octokit).toBeDefined();
  });

  it("does not throw when private key has real newlines", async () => {
    const { createAppOctokit } = await import("./app-auth");
    expect(() => createAppOctokit()).not.toThrow();
  });
});
