import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_POST_LOGIN_PATH = "/dashboard";
const AUTH_ERROR_PATH = "/login?error=auth_failed";

function redirect(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function getSafePostLoginPath(
  request: NextRequest,
  requestedPath: string | null
): string {
  if (!requestedPath || !requestedPath.startsWith("/")) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  try {
    const requestedUrl = new URL(requestedPath, request.nextUrl.origin);

    if (
      requestedUrl.origin !== request.nextUrl.origin ||
      requestedUrl.pathname === "/api" ||
      requestedUrl.pathname.startsWith("/api/")
    ) {
      return DEFAULT_POST_LOGIN_PATH;
    }

    return `${requestedUrl.pathname}${requestedUrl.search}${requestedUrl.hash}`;
  } catch {
    return DEFAULT_POST_LOGIN_PATH;
  }
}

/**
 * Completes the existing Supabase PKCE flow.
 *
 * Supabase—not this application—validates the GitHub OAuth state and exchanges
 * the GitHub provider code. This handler exchanges only Supabase's one-time
 * PKCE code for the application's cookie session.
 */
export async function handleAuthCallback(
  request: NextRequest
): Promise<NextResponse> {
  const providerError =
    request.nextUrl.searchParams.get("error") ??
    request.nextUrl.searchParams.get("error_code");
  const code = request.nextUrl.searchParams.get("code");

  if (providerError || !code?.trim()) {
    return redirect(request, AUTH_ERROR_PATH);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirect(request, AUTH_ERROR_PATH);
    }
  } catch {
    return redirect(request, AUTH_ERROR_PATH);
  }

  const nextPath = getSafePostLoginPath(
    request,
    request.nextUrl.searchParams.get("next")
  );

  return redirect(request, nextPath);
}
