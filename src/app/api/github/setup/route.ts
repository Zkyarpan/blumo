import { NextResponse } from "next/server";
import { callbackParamsSchema } from "@/lib/github/callback-params.schema";
import { getUser } from "@/features/auth/get-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { processInstallationCallback } from "@/features/github/installation.service";
import type { InstallationErrorCode } from "@/features/github/installation.service";

/**
 * Maps service error codes to safe redirect query parameter values.
 * These are the only redirect targets; no client-supplied URL is ever used.
 */
const ERROR_CODE_TO_REDIRECT: Record<InstallationErrorCode, string> = {
  UNAUTHENTICATED: "/login",
  NOT_ONBOARDED: "/onboarding",
  MISSING_INSTALLATION_ID: "/github/connect?error=missing_installation",
  INVALID_INSTALLATION: "/github/connect?error=invalid_installation",
  GITHUB_UNAVAILABLE: "/github/connect?error=github_unavailable",
  OWNERSHIP_MISMATCH: "/github/connect?error=ownership_mismatch",
  ORG_NOT_SUPPORTED: "/github/connect?error=org_not_supported",
  INSTALLATION_CONFLICT: "/github/connect?error=installation_conflict",
  DB_ERROR: "/github/connect?error=server_error",
};

/**
 * GitHub App setup callback handler.
 *
 * GitHub redirects to this URL after a user installs or updates the Blumo App:
 *   GET /api/github/setup?installation_id=<number>&setup_action=install|update
 *
 * This handler:
 * 1. Validates the query parameters.
 * 2. Verifies the Blumo session.
 * 3. Verifies the installation via the GitHub API (never trusts the URL param directly).
 * 4. Upserts the verified installation into github_installations.
 * 5. Records an audit event.
 * 6. Redirects the user to /dashboard (placeholder for /github/repositories in Unit 08).
 *
 * This is a redirect-only handler. No JSON response body is ever returned.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  // Step 1: Parse and validate query parameters.
  const rawParams = {
    installation_id: url.searchParams.get("installation_id") ?? undefined,
    setup_action: url.searchParams.get("setup_action") ?? undefined,
  };

  // Handle cancelled or malformed callbacks before parsing.
  // GitHub does not always send a callback for cancellations.
  if (!rawParams.installation_id && !rawParams.setup_action) {
    return NextResponse.redirect(
      new URL("/github/connect?error=cancelled", request.url)
    );
  }

  const parseResult = callbackParamsSchema.safeParse(rawParams);

  if (!parseResult.success) {
    return NextResponse.redirect(
      new URL("/github/connect?error=missing_installation", request.url)
    );
  }

  const { installation_id: installationId } = parseResult.data;

  // Step 2: Verify the Blumo session — user must be signed in and onboarded.
  const user = await getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Fetch the profile including github_user_id for ownership verification.
  // Use the anon-key server client — getProfile() does not include github_user_id,
  // so we select it directly here.
  const supabase = await createSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("onboarding_completed_at, github_user_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.redirect(
      new URL("/github/connect?error=server_error", request.url)
    );
  }

  if (!profile.onboarding_completed_at) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // Security: github_user_id must be populated.
  // If null, the handle_new_user() trigger may have failed. Log and redirect.
  if (!profile.github_user_id) {
    console.error(
      "[setup/route] github_user_id is null for user",
      user.id,
      "— profile trigger may have failed"
    );
    return NextResponse.redirect(
      new URL("/github/connect?error=server_error", request.url)
    );
  }

  // Step 3–7: Verify installation via GitHub API and store the result.
  const result = await processInstallationCallback(
    installationId,
    user.id,
    profile.github_user_id
  );

  if (!result.ok) {
    const redirectPath = ERROR_CODE_TO_REDIRECT[result.errorCode];
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  // Step 8: Redirect to dashboard (placeholder for /github/repositories, Unit 08).
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
