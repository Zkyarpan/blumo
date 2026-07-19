import { describe, it, expect, vi, beforeEach } from "vitest";

// The env module reads process.env at import time, so we must set variables
// before importing in each test.
describe("publicEnv", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns defaults when env vars are not set", async () => {
    delete process.env.NEXT_PUBLIC_APP_NAME;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { publicEnv } = await import("@/lib/env/public");
    expect(publicEnv.NEXT_PUBLIC_APP_NAME).toBe("Blumo");
    expect(publicEnv.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("uses provided NEXT_PUBLIC_APP_NAME when set", async () => {
    process.env.NEXT_PUBLIC_APP_NAME = "TestBlumo";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    const { publicEnv } = await import("@/lib/env/public");
    expect(publicEnv.NEXT_PUBLIC_APP_NAME).toBe("TestBlumo");
    expect(publicEnv.NEXT_PUBLIC_APP_URL).toBe("https://example.com");
  });

  it("throws when NEXT_PUBLIC_APP_URL is an invalid URL", async () => {
    process.env.NEXT_PUBLIC_APP_NAME = "Blumo";
    process.env.NEXT_PUBLIC_APP_URL = "not-a-url";
    await expect(import("@/lib/env/public")).rejects.toThrow(
      "Invalid public environment variables"
    );
  });
});
