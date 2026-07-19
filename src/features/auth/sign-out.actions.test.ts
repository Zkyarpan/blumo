import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/navigation redirect to avoid it throwing in tests
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
const mockedCreateClient = vi.mocked(createSupabaseServerClient);

describe("signOut", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("calls supabase.auth.signOut() and redirects to /login", async () => {
    const signOutFn = vi.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({
      auth: { signOut: signOutFn },
    } as never);

    const { signOut } = await import("@/features/auth/sign-out.actions");

    await expect(signOut()).rejects.toThrow("REDIRECT:/login");
    expect(signOutFn).toHaveBeenCalledOnce();
  });
});
