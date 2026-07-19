import "server-only";

import { createAppOctokit } from "@/lib/github/app-auth";

export type InstallationTokenResult =
  | { ok: true; token: string }
  | {
      ok: false;
      errorCode: "GITHUB_UNAVAILABLE" | "INVALID_INSTALLATION";
    };

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  );
}

/**
 * Generates a short-lived token scoped to one verified GitHub App installation.
 * The caller must use the token immediately and must never persist or log it.
 */
export async function createInstallationToken(
  installationId: number
): Promise<InstallationTokenResult> {
  try {
    const octokit = createAppOctokit();
    const response = await octokit.rest.apps.createInstallationAccessToken({
      installation_id: installationId,
    });

    return { ok: true, token: response.data.token };
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return { ok: false, errorCode: "INVALID_INSTALLATION" };
    }

    return { ok: false, errorCode: "GITHUB_UNAVAILABLE" };
  }
}
