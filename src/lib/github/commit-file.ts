import "server-only";

import { Octokit } from "@octokit/rest";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type RefShaResult =
  | { ok: true; sha: string }
  | { ok: false; reason: "not_found" | "github_unavailable" };

export type BranchCheckResult =
  | { ok: true; exists: true; sha: string }
  | { ok: true; exists: false }
  | { ok: false; reason: "github_unavailable" };

export type ExistingFileResult =
  | { ok: true; exists: false }
  | { ok: true; exists: true; blobSha: string; lastCommitterAppId: number | null }
  | { ok: false; reason: "github_unavailable" };

export type CreateBranchResult =
  | { ok: true }
  | { ok: false; reason: "branch_conflict" | "github_unavailable" };

export type CommitFileResult =
  | {
      ok: true;
      commitSha: string;
      commitUrl: string;
      commitMessage: string;
    }
  | {
      ok: false;
      reason:
        | "github_unavailable"
        | "permission_changed"
        | "file_conflict"
        | "branch_conflict";
    };

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

function isGitHubStatus(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === status
  );
}

function isBranchAlreadyExists(error: unknown): boolean {
  if (!isGitHubStatus(error, 422)) return false;
  const msg =
    typeof (error as { message?: unknown }).message === "string"
      ? ((error as { message: string }).message ?? "").toLowerCase()
      : "";
  return (
    msg.includes("reference already exists") ||
    msg.includes("already exists")
  );
}

// --------------------------------------------------------------------------
// Operations
// --------------------------------------------------------------------------

/**
 * Fetches the HEAD SHA of a branch (e.g. the default branch).
 * The installation token is passed in and must not be stored.
 */
export async function getRefSha(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<RefShaResult> {
  try {
    const octokit = makeOctokit(token);
    const response = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    return { ok: true, sha: response.data.object.sha };
  } catch (error: unknown) {
    if (isGitHubStatus(error, 404)) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: false, reason: "github_unavailable" };
  }
}

/**
 * Checks whether a specific branch already exists.
 * Returns its HEAD SHA when found (so we can commit to it directly).
 */
export async function checkBranchExists(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<BranchCheckResult> {
  try {
    const octokit = makeOctokit(token);
    const response = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    return { ok: true, exists: true, sha: response.data.object.sha };
  } catch (error: unknown) {
    if (isGitHubStatus(error, 404)) {
      return { ok: true, exists: false };
    }
    return { ok: false, reason: "github_unavailable" };
  }
}

/**
 * Checks whether a file already exists at the target path.
 * Returns the blob SHA if found (needed for updates).
 * Pass `ref` to check on a specific branch rather than the default branch.
 */
export async function checkExistingFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<ExistingFileResult> {
  try {
    const octokit = makeOctokit(token);
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ...(ref ? { ref } : {}),
    });
    const data = response.data;
    if (Array.isArray(data)) {
      // It's a directory — treat as conflict
      return {
        ok: true,
        exists: true,
        blobSha: "",
        lastCommitterAppId: null,
      };
    }
    const fileData = data as { sha?: string };
    return {
      ok: true,
      exists: true,
      blobSha: typeof fileData.sha === "string" ? fileData.sha : "",
      lastCommitterAppId: null, // GitHub contents API doesn't surface committer app ID directly
    };
  } catch (error: unknown) {
    if (isGitHubStatus(error, 404)) {
      return { ok: true, exists: false };
    }
    return { ok: false, reason: "github_unavailable" };
  }
}

/**
 * Creates a new branch from a base commit SHA.
 * Returns branch_conflict if the branch already exists.
 */
export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  baseSha: string
): Promise<CreateBranchResult> {
  try {
    const octokit = makeOctokit(token);
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
    return { ok: true };
  } catch (error: unknown) {
    if (isBranchAlreadyExists(error)) {
      return { ok: false, reason: "branch_conflict" };
    }
    return { ok: false, reason: "github_unavailable" };
  }
}

/**
 * Commits a file to the specified branch.
 * Pass blobSha when updating an existing Blumo-managed file; omit for new files.
 * The content must be Base64-encoded UTF-8.
 */
export async function commitFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  message: string,
  base64Content: string,
  branch: string,
  blobSha?: string
): Promise<CommitFileResult> {
  try {
    const octokit = makeOctokit(token);
    const response = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: base64Content,
      branch,
      ...(blobSha ? { sha: blobSha } : {}),
    });
    const commit = response.data.commit;
    return {
      ok: true,
      commitSha: commit.sha ?? "",
      commitUrl: commit.html_url ?? "",
      commitMessage: commit.message ?? message,
    };
  } catch (error: unknown) {
    if (isGitHubStatus(error, 403)) {
      return { ok: false, reason: "permission_changed" };
    }
    if (isGitHubStatus(error, 409)) {
      // Conflict — file was updated between check and write
      return { ok: false, reason: "file_conflict" };
    }
    if (isGitHubStatus(error, 422)) {
      return { ok: false, reason: "branch_conflict" };
    }
    return { ok: false, reason: "github_unavailable" };
  }
}
