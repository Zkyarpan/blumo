import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Pollinations configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults the optional model to openai", async () => {
    vi.stubEnv("POLLINATIONS_API_KEY", "server-secret");
    vi.stubEnv("POLLINATIONS_TEXT_MODEL", "");
    const { getPollinationsConfig } = await import("./pollinations.config");
    expect(getPollinationsConfig()).toEqual({
      apiKey: "server-secret",
      model: "openai",
    });
  });

  it("fails closed only when generation asks for a missing key", async () => {
    vi.stubEnv("POLLINATIONS_API_KEY", "");
    const { getPollinationsConfig } = await import("./pollinations.config");
    expect(() => getPollinationsConfig()).toThrow("configuration_error");
  });
});
