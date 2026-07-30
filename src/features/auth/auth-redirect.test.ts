import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverEnv: {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SITE_URL: undefined as string | undefined,
  },
}));

vi.mock("@/lib/env/server", () => ({
  serverEnv: mocks.serverEnv,
}));

import { getAuthCallbackUrl } from "./auth-redirect";

describe("getAuthCallbackUrl", () => {
  beforeEach(() => {
    mocks.serverEnv.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    mocks.serverEnv.NEXT_PUBLIC_SITE_URL = undefined;
  });

  it("uses the localhost application URL in development", () => {
    expect(getAuthCallbackUrl()).toBe(
      "http://localhost:3000/api/github/callback"
    );
  });

  it("prefers the production site URL when configured", () => {
    mocks.serverEnv.NEXT_PUBLIC_SITE_URL = "https://blumo-ten.vercel.app";

    expect(getAuthCallbackUrl()).toBe(
      "https://blumo-ten.vercel.app/api/github/callback"
    );
  });

  it("removes a configured path and trailing slash from the application URL", () => {
    mocks.serverEnv.NEXT_PUBLIC_SITE_URL =
      "https://blumo-ten.vercel.app/some-path/";

    expect(getAuthCallbackUrl()).toBe(
      "https://blumo-ten.vercel.app/api/github/callback"
    );
  });
});
