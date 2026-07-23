import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const select = vi.fn();
  const from = vi.fn(() => ({ select }));
  const createSupabaseAdminClient = vi.fn(() => ({ from }));

  return {
    serverEnv: {
      CRON_SECRET: "a".repeat(64) as string | undefined,
    },
    select,
    from,
    createSupabaseAdminClient,
  };
});

vi.mock("@/lib/env/server", () => ({
  serverEnv: mocks.serverEnv,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { GET } from "./route";

const SECRET = "a".repeat(64);

function request(authorization?: string): Request {
  return new Request("https://blumo.example/api/cron/supabase-keep-alive", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("GET /api/cron/supabase-keep-alive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serverEnv.CRON_SECRET = SECRET;
    mocks.select.mockResolvedValue({ error: null });
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    mocks.serverEnv.CRON_SECRET = undefined;

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      data: null,
      error: {
        code: "CRON_NOT_CONFIGURED",
        message: "Scheduled service is not configured.",
      },
    });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it.each([undefined, "Bearer wrong-secret"])(
    "rejects a missing or invalid authorization header",
    async (authorization) => {
      const response = await GET(request(authorization));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "Unauthorized.",
        },
      });
      expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    }
  );

  it("performs one minimal query and returns fixed success JSON", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      data: { ok: true },
      error: null,
    });
    expect(mocks.createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
  });

  it("returns a sanitized failure when Supabase rejects the query", async () => {
    mocks.select.mockResolvedValue({
      error: { message: "secret database detail" },
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("KEEP_ALIVE_FAILED");
    expect(body).not.toContain("secret database detail");
  });

  it("returns a sanitized failure when the client throws", async () => {
    mocks.createSupabaseAdminClient.mockImplementationOnce(() => {
      throw new Error("secret initialization detail");
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("KEEP_ALIVE_FAILED");
    expect(body).not.toContain("secret initialization detail");
  });
});
