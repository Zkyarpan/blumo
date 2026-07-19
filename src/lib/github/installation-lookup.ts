import "server-only";

import type { Octokit } from "@octokit/rest";

export type GitHubInstallationAccount = {
  id: number;
  login: string;
  type: "User" | "Organization";
};

export type GitHubInstallation = {
  id: number;
  account: GitHubInstallationAccount;
};

/**
 * Retrieves a GitHub App installation by its numeric ID.
 * Returns null if the installation does not exist (404) or if the account
 * data is incomplete.
 * Throws for unexpected network or API errors so the caller can normalize them.
 *
 * The Octokit instance must be authenticated as the App (not an installation).
 * Only the fields that the application needs are returned.
 */
export async function getInstallationById(
  octokit: Octokit,
  installationId: number
): Promise<GitHubInstallation | null> {
  try {
    const response = await octokit.rest.apps.getInstallation({
      installation_id: installationId,
    });

    const { id, account } = response.data;

    if (!account || !("login" in account) || !("type" in account)) {
      return null;
    }

    return {
      id,
      account: {
        id: account.id,
        login: account.login,
        type: account.type as "User" | "Organization",
      },
    };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status: number }).status === 404
    ) {
      return null;
    }
    throw error;
  }
}
