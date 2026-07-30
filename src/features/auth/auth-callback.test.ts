import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { handleAuthCallback } from "./auth-callback";

function request(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/github/callback${query}`
  );
}

describe("handleAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
      },
    });
  });

  it("redirects a missing code to a fixed login error", async () => {
    const response = await handleAuthCallback(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=auth_failed"
    );
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("handles a cancelled provider authorization without exchanging a code", async () => {
    const response = await handleAuthCallback(
      request("?error=access_denied&error_description=cancelled")
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=auth_failed"
    );
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("exchanges a valid Supabase PKCE code and redirects to dashboard", async () => {
    const response = await handleAuthCallback(request("?code=one-time-code"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard"
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("redirects a failed code exchange without exposing the error", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "sensitive provider detail" },
    });

    const response = await handleAuthCallback(request("?code=invalid-code"));
    const location = response.headers.get("location");

    expect(location).toBe(
      "http://localhost:3000/login?error=auth_failed"
    );
    expect(location).not.toContain("sensitive");
    expect(location).not.toContain("invalid-code");
  });

  it("allows a safe same-origin post-login path", async () => {
    const response = await handleAuthCallback(
      request("?code=one-time-code&next=%2Fhistory%3Fview%3Dweek")
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/history?view=week"
    );
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal",
    "/api/github/callback",
  ])("rejects an unsafe post-login destination: %s", async (next) => {
    const url = new URL("http://localhost:3000/api/github/callback");
    url.searchParams.set("code", "one-time-code");
    url.searchParams.set("next", next);

    const response = await handleAuthCallback(new NextRequest(url));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard"
    );
  });
});
