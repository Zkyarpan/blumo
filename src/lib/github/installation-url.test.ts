import { describe, it, expect } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    GITHUB_APP_SLUG: "blumo-development",
  },
}));

describe("getInstallationUrl", () => {
  it("returns a URL containing the app slug", async () => {
    const { getInstallationUrl } = await import("./installation-url");
    const url = getInstallationUrl();
    expect(url).toContain("blumo-development");
    expect(url).toContain("github.com/apps/");
  });

  it("returns a URL ending with /installations/new", async () => {
    const { getInstallationUrl } = await import("./installation-url");
    const url = getInstallationUrl();
    expect(url).toMatch(/\/installations\/new$/);
  });

  it("returns a valid https URL", async () => {
    const { getInstallationUrl } = await import("./installation-url");
    const url = getInstallationUrl();
    expect(url).toMatch(/^https:\/\//);
  });

  it("never exposes GITHUB_APP_PRIVATE_KEY in the URL", async () => {
    const { getInstallationUrl } = await import("./installation-url");
    const url = getInstallationUrl();
    expect(url).not.toContain("PRIVATE_KEY");
    expect(url).not.toContain("BEGIN RSA");
  });
});
