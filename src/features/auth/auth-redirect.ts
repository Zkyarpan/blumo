import "server-only";

import { serverEnv } from "@/lib/env/server";

export const AUTH_CALLBACK_PATH = "/api/github/callback";

/**
 * Builds the allowlisted Supabase post-authentication callback URL.
 * Production prefers NEXT_PUBLIC_SITE_URL; localhost falls back to APP_URL.
 */
export function getAuthCallbackUrl(): string {
  const configuredUrl =
    serverEnv.NEXT_PUBLIC_SITE_URL ?? serverEnv.NEXT_PUBLIC_APP_URL;
  const appOrigin = new URL(configuredUrl).origin;

  return new URL(AUTH_CALLBACK_PATH, appOrigin).toString();
}
