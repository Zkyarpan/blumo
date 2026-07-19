import "server-only";

import { Octokit } from "@octokit/rest";

export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
};

export type RepositoryListResult =
  | { ok: true; repositories: GitHubRepository[] }
  | { ok: false; errorCode: "GITHUB_UNAVAILABLE" };

/**
 * Lists every repository accessible to one installation token.
 * The token is used only to construct this request-scoped Octokit instance.
 */
export async function listInstallationRepositories(
  token: string,
  installationId: number
): Promise<RepositoryListResult> {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    return { ok: false, errorCode: "GITHUB_UNAVAILABLE" };
  }

  try {
    const octokit = new Octokit({ auth: token });
    const repositories = await octokit.paginate(
      octokit.rest.apps.listReposAccessibleToInstallation,
      { per_page: 100 }
    );

    return {
      ok: true,
      repositories: repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        full_name: repository.full_name,
        owner: { login: repository.owner.login },
        private: repository.private,
        default_branch: repository.default_branch,
      })),
    };
  } catch {
    return { ok: false, errorCode: "GITHUB_UNAVAILABLE" };
  }
}
