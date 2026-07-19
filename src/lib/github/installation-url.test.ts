import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildInstallationUrl } from "./installation-url";

describe("buildInstallationUrl", () => {
  it("returns the correct URL for a valid slug", () => {
    expect(buildInstallationUrl("blumo-development")).toBe(
      "https://github.com/apps/blumo-development/installations/new"
    );
  });

  it("strips leading and trailing whitespace from the slug", () => {
    expect(buildInstallationUrl("  blumo-development  ")).toBe(
      "https://github.com/apps/blumo-development/installations/new"
    );
  });

  it("throws with a descriptive message for an empty string slug", () => {
    expect(() => buildInstallationUrl("")).toThrow(
      "GITHUB_APP_SLUG is required to build an installation URL"
    );
  });

  it("URL-encodes a slug that contains characters needing encoding", () => {
    expect(buildInstallationUrl("blumo app")).toBe(
      "https://github.com/apps/blumo%20app/installations/new"
    );
  });
});
