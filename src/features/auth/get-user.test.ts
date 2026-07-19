import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock the entire supabase/server module so these tests never need
// real Supabase credentials and remain fast.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

// server-only is a no-op in the test environment
vi.mock("server-only", () => ({}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
const mockedCreateClient = vi.mocked(createSupabaseServerClient);

describe("getUser", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns the user when Supabase returns a valid user", async () => {
    const fakeUser = { id: "user-123", email: "test@example.com" };
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: fakeUser },
          error: null,
        }),
      },
    } as never);

    const { getUser } = await import("@/features/auth/get-user");
    const result = await getUser();
    expect(result).toEqual(fakeUser);
  });

  it("returns null when Supabase returns an error", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "session not found" },
        }),
      },
    } as never);

    const { getUser } = await import("@/features/auth/get-user");
    const result = await getUser();
    expect(result).toBeNull();
  });

  it("returns null when user is null and no error", async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as never);

    const { getUser } = await import("@/features/auth/get-user");
    const result = await getUser();
    expect(result).toBeNull();
  });
});
