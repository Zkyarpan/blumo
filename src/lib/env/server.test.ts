import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

function setRequiredEnvironment() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "service-key");
  vi.stubEnv("GITHUB_APP_ID", "1234567");
  vi.stubEnv("GITHUB_APP_SLUG", "blumo-development");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", "webhook-secret");
}

describe("server environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("requires and parses a server-only webhook secret", async () => {
    setRequiredEnvironment();
    const { serverEnv } = await import("@/lib/env/server");
    expect(serverEnv.GITHUB_WEBHOOK_SECRET).toBe("webhook-secret");
  });

  it("rejects a missing webhook secret", async () => {
    setRequiredEnvironment();
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(import("@/lib/env/server")).rejects.toThrow(
      "Invalid server environment variables"
    );
  });

  it("accepts a cron secret with at least 32 characters", async () => {
    setRequiredEnvironment();
    vi.stubEnv("CRON_SECRET", "c".repeat(32));

    const { serverEnv } = await import("@/lib/env/server");

    expect(serverEnv.CRON_SECRET).toBe("c".repeat(32));
  });

  it("rejects a configured cron secret shorter than 32 characters", async () => {
    setRequiredEnvironment();
    vi.stubEnv("CRON_SECRET", "too-short");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(import("@/lib/env/server")).rejects.toThrow(
      "Invalid server environment variables"
    );
  });
});
