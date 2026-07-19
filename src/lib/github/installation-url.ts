import "server-only";

/**
 * Builds the GitHub App installation URL for a given App slug.
 *
 * Format:  https://github.com/apps/{slug}/installations/new
 *
 * The user arrives here to choose which repositories to grant access to.
 * GitHub redirects back to the configured setup URL with installation_id
 * after the user confirms.
 */
export function buildInstallationUrl(appSlug: string): string {
  if (!appSlug || appSlug.trim() === "") {
    throw new Error("GITHUB_APP_SLUG is required to build an installation URL");
  }
  return `https://github.com/apps/${encodeURIComponent(appSlug.trim())}/installations/new`;
}
