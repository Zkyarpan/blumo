import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getAuthCallbackUrl, redirect } = vi.hoisted(
  () => ({
    createSupabaseServerClient: vi.fn(),
    getAuthCallbackUrl: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/features/auth/auth-redirect", () => ({
  getAuthCallbackUrl,
}));

vi.mock("next/navigation", () => ({
  redirect,
}));

import { signInWithGitHub } from "@/features/auth/sign-in.actions";

describe("signInWithGitHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthCallbackUrl.mockReturnValue(
      "http://localhost:3000/api/github/callback",
    );
  });

  it("starts Supabase GitHub OAuth with the canonical callback", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: "https://supabase.example/authorize" },
      error: null,
    });

    createSupabaseServerClient.mockResolvedValue({
      auth: { signInWithOAuth },
    });

    await expect(signInWithGitHub()).rejects.toThrow(
      "NEXT_REDIRECT:https://supabase.example/authorize",
    );

    expect(signInWithOAuth).toHaveBeenCalledOnce();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: {
        redirectTo: "http://localhost:3000/api/github/callback",
        scopes: "read:user user:email",
      },
    });
  });

  it("returns safely to login when Supabase cannot start OAuth", async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: { url: null },
          error: new Error("provider secret"),
        }),
      },
    });

    await expect(signInWithGitHub()).rejects.toThrow(
      "NEXT_REDIRECT:/login?error=auth_failed",
    );
  });
});
