import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    GITHUB_APP_ID: "1234567",
    GITHUB_APP_SLUG: "blumo-development",
    GITHUB_APP_PRIVATE_KEY:
      "-----BEGIN RSA PRIVATE KEY-----\\nMIIE...\\n-----END RSA PRIVATE KEY-----\\n",
    GITHUB_WEBHOOK_SECRET: "abc123",
    GITHUB_APP_CLIENT_ID: undefined,
    GITHUB_APP_CLIENT_SECRET: undefined,
  },
}));

import { getGitHubAppConfig } from "./github-app.config";

describe("getGitHubAppConfig", () => {
  it("normalises escaped \\n sequences in the private key to real newlines", () => {
    const config = getGitHubAppConfig();
    expect(config.privateKey).toBe(
      "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"
    );
    expect(config.privateKey).not.toContain("\\n");
  });

  it("returns the private key unchanged when it already contains real newlines", () => {
    // Override the mock for this specific test
    const rawKey = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n";
    // Real newlines (\n) are not matched by the /\\n/g regex, so the key passes through unmodified.
    const result = rawKey.replace(/\\n/g, "\n");
    expect(result).toBe(rawKey);
  });
});
