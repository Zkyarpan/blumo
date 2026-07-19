import "server-only";

import { serverEnv } from "@/lib/env/server";

/**
 * Builds the GitHub App installation URL.
 *
 * When the user clicks "Connect GitHub", they are redirected to this URL.
 * GitHub then redirects back to the setup callback after installation.
 *
 * Server-only — the App slug is a non-secret but must only be composed
 * server-side so it can never be tampered with.
 */
export function getInstallationUrl(): string {
  const slug = serverEnv.GITHUB_APP_SLUG;

  // GitHub installation page format: https://github.com/apps/<slug>/installations/new
  // The redirect_url is optional; GitHub already knows the Setup URL from App config.
  return `https://github.com/apps/${slug}/installations/new`;
}
