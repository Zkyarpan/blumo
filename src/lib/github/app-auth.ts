import "server-only";

import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { getGitHubAppConfig } from "@/lib/github/github-app.config";

/**
 * Returns an Octokit instance authenticated as the GitHub App.
 * Uses a short-lived signed JWT; does not request an installation token.
 * The JWT is valid for 10 minutes and is used only for App-level API calls
 * such as retrieving installation details.
 *
 * Never call this in client code. Import "server-only" enforces this.
 * The App JWT and private key are never logged or returned.
 */
export function createAppOctokit(): Octokit {
  const { appId, privateKey } = getGitHubAppConfig();

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });
}
