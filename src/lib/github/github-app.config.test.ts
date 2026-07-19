import { describe, it, expect } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    GITHUB_APP_ID: "4335897",
    GITHUB_APP_SLUG: "blumo-development",
    GITHUB_APP_PRIVATE_KEY:
      "-----BEGIN RSA PRIVATE KEY-----\\nFAKE\\n-----END RSA PRIVATE KEY-----\\n",
    GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
    GITHUB_APP_CLIENT_ID: undefined,
    GITHUB_APP_CLIENT_SECRET: undefined,
  },
}));

describe("getGitHubAppConfig", () => {
  it("returns a config object with the correct App ID", async () => {
    const { getGitHubAppConfig } = await import("./github-app.config");
    const config = getGitHubAppConfig();
    expect(config.appId).toBe(4335897);
  });

  it("normalises escaped \\n sequences in the private key", async () => {
    const { getGitHubAppConfig } = await import("./github-app.config");
    const config = getGitHubAppConfig();
    expect(config.privateKey).toContain("\n");
    expect(config.privateKey).not.toContain("\\n");
  });

  it("returns the required webhook secret without exposing it to client code", async () => {
    const { getGitHubAppConfig } = await import("./github-app.config");
    expect(getGitHubAppConfig().webhookSecret).toBe("test-webhook-secret");
  });
});
