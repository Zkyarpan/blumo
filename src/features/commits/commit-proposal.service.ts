import "server-only";

import { randomUUID } from "node:crypto";
import { createInstallationToken } from "@/lib/github/installation-token";
import {
  getRefSha,
  checkBranchExists,
  checkExistingFile,
  createBranch,
  commitFile,
} from "@/lib/github/commit-file";
import { normalizeTitleSlug, buildBranchName } from "@/lib/security/branch-name";
import { buildFilePath, validateSafePath } from "@/lib/security/safe-path";
import { formatMissionContent } from "@/lib/security/commit-content-formatter";
import {
  loadCommitProposalRows,
  recordMissionCommit,
  recordReconciliationRequired,
} from "./commit-proposal.repository";
import type {
  CommitProposalData,
  CommitProposalResult,

  ExecuteCommitResult,
} from "./commit.types";

// --------------------------------------------------------------------------
// Build the commit proposal (read-only — derives proposal fields from DB)
// --------------------------------------------------------------------------

export async function buildCommitProposal(
  userId: string,
  taskId: string
): Promise<CommitProposalResult> {
  const rows = await loadCommitProposalRows(userId, taskId);

  if (!rows.ok) {
    switch (rows.reason) {
      case "not_found":
        return { kind: "not_found" };
      case "not_approved":
        return { kind: "not_approved" };
      case "repository_unavailable":
        return { kind: "repository_unavailable" };
      case "installation_suspended":
        return { kind: "installation_suspended" };
      default:
        return { kind: "error" };
    }
  }

  const { taskRow, versionRow } = rows;

  // Derive proposal fields from owned stored data
  const titleSlug = normalizeTitleSlug(versionRow.title);
  const branchResult = buildBranchName(taskRow.scheduledDate, titleSlug);
  if (!branchResult.ok) {
    return { kind: "error" };
  }

  const filePath = buildFilePath(taskRow.scheduledDate, titleSlug);
  if (!filePath) {
    return { kind: "error" };
  }

  const contentResult = formatMissionContent({
    title: versionRow.title,
    description: versionRow.description,
    acceptanceChecklist: versionRow.acceptanceChecklist,
    learningOutcome: versionRow.learningOutcome,
    scheduledDate: taskRow.scheduledDate,
    aiProvider: versionRow.aiProvider,
  });
  if (!contentResult.ok) {
    return { kind: "error" };
  }

  // Validate the commit message length (5–100 chars per spec)
  const commitMessage = versionRow.suggestedCommitMessage.trim();
  if (commitMessage.length < 5 || commitMessage.length > 100) {
    return { kind: "error" };
  }

  // Generate a server-side operation ID for idempotency
  const operationId = randomUUID();

  const proposalData: CommitProposalData = {
    taskId,
    operationId,
    repositoryFullName: taskRow.repositoryFullName,
    baseBranch: taskRow.repositoryDefaultBranch,
    proposedBranch: branchResult.branchName,
    proposedPath: filePath,
    proposedContent: contentResult.content,
    commitMessage,
    missionTitle: versionRow.title,
    scheduledDate: taskRow.scheduledDate,
  };

  return { kind: "proposal", data: proposalData };
}

// --------------------------------------------------------------------------
// Execute the commit (mutation — triggers GitHub write)
// --------------------------------------------------------------------------

export async function executeCommit(
  userId: string,
  taskId: string
): Promise<ExecuteCommitResult> {
  // Re-verify all preconditions from owned DB state
  const rows = await loadCommitProposalRows(userId, taskId);

  if (!rows.ok) {
    switch (rows.reason) {
      case "not_found":
        return { code: "not_found" };
      case "not_approved":
        return { code: "invalid_transition" };
      case "repository_unavailable":
        return { code: "repository_unavailable" };
      case "installation_suspended":
        return { code: "installation_suspended" };
      default:
        return { code: "database_error" };
    }
  }

  const { taskRow, versionRow } = rows;

  // Recompute proposal fields server-side — never from client
  const titleSlug = normalizeTitleSlug(versionRow.title);
  const branchResult = buildBranchName(taskRow.scheduledDate, titleSlug);
  if (!branchResult.ok) {
    return { code: "invalid_branch" };
  }

  const filePath = buildFilePath(taskRow.scheduledDate, titleSlug);
  if (!filePath) {
    return { code: "invalid_path" };
  }

  // Validate path immediately before GitHub call
  const pathValidation = validateSafePath(filePath);
  if (!pathValidation.ok) {
    return { code: "invalid_path" };
  }

  // Check that branch !== default branch
  if (branchResult.branchName === taskRow.repositoryDefaultBranch) {
    return { code: "invalid_branch" };
  }

  // Assemble file content
  const contentResult = formatMissionContent({
    title: versionRow.title,
    description: versionRow.description,
    acceptanceChecklist: versionRow.acceptanceChecklist,
    learningOutcome: versionRow.learningOutcome,
    scheduledDate: taskRow.scheduledDate,
    aiProvider: versionRow.aiProvider,
  });
  if (!contentResult.ok) {
    return { code: "content_too_large" };
  }

  const commitMessage = versionRow.suggestedCommitMessage.trim();
  if (commitMessage.length < 5 || commitMessage.length > 100) {
    return { code: "invalid_request" };
  }

  // Parse owner/repo from full_name
  const slashIdx = taskRow.repositoryFullName.indexOf("/");
  if (slashIdx < 0) {
    return { code: "database_error" };
  }
  const owner = taskRow.repositoryFullName.slice(0, slashIdx);
  const repoName = taskRow.repositoryFullName.slice(slashIdx + 1);

  // Generate installation token — discard after use, never store
  const tokenResult = await createInstallationToken(
    taskRow.installationGithubId
  );
  if (!tokenResult.ok) {
    return { code: "github_unavailable" };
  }
  const token = tokenResult.token;

  // Fetch base branch SHA (needed if we have to create the mission branch)
  const refResult = await getRefSha(
    token,
    owner,
    repoName,
    taskRow.repositoryDefaultBranch
  );
  if (!refResult.ok) {
    return {
      code: refResult.reason === "not_found"
        ? "repository_unavailable"
        : "github_unavailable",
    };
  }
  const baseSha = refResult.sha;

  // Check whether the mission branch already exists.
  // This handles retries after a network failure mid-commit.
  const missionBranch = branchResult.branchName;
  const branchCheck = await checkBranchExists(token, owner, repoName, missionBranch);
  if (!branchCheck.ok) {
    return { code: "github_unavailable" };
  }

  if (!branchCheck.exists) {
    // Branch does not exist — create it from the default branch HEAD.
    const createResult = await createBranch(token, owner, repoName, missionBranch, baseSha);
    if (!createResult.ok) {
      // Race condition: another request created it between our check and create.
      // Fall through and attempt to commit to it on the next check below.
      if (createResult.reason !== "branch_conflict") {
        return { code: "github_unavailable" };
      }
    }
  }

  // Check existing file on the mission branch (not the default branch).
  // This is the correct ref whether the branch just existed or we just created it.
  const fileCheck = await checkExistingFile(token, owner, repoName, filePath, missionBranch);
  if (!fileCheck.ok) {
    return { code: "github_unavailable" };
  }

  let blobSha: string | undefined;
  if (fileCheck.exists) {
    // The file already exists on this mission branch.
    // Since the path is inside blumo/** and constructed from our own slug,
    // this is a Blumo-managed file from a previous partial attempt.
    // Allow the update — pass blobSha so GitHub accepts the PUT.
    if (!fileCheck.blobSha) {
      return { code: "file_conflict" };
    }
    blobSha = fileCheck.blobSha;
  }

  // Encode content as Base64
  const base64Content = Buffer.from(contentResult.content, "utf8").toString(
    "base64"
  );

  // Commit the file to the mission branch
  const commitResult = await commitFile(
    token,
    owner,
    repoName,
    filePath,
    commitMessage,
    base64Content,
    missionBranch,
    blobSha
  );

  if (!commitResult.ok) {
    return { code: commitResult.reason };
  }

  // Record the commit atomically — transition task to completed
  const dbResult = await recordMissionCommit({
    userId,
    taskId,
    repositoryId: taskRow.repositoryId,
    githubCommitSha: commitResult.commitSha,
    githubCommitUrl: commitResult.commitUrl,
    branch: missionBranch,
    filePath,
    commitMessage,
    contentSnapshot: contentResult.content,
    operationId: randomUUID(),
    versionNumber: versionRow.versionNumber,
  });

  if (dbResult === "database_error") {
    // GitHub succeeded but DB failed — record reconciliation_required
    await recordReconciliationRequired({
      userId,
      taskId,
      repositoryId: taskRow.repositoryId,
      githubCommitSha: commitResult.commitSha,
      githubCommitUrl: commitResult.commitUrl,
      branch: missionBranch,
      filePath,
      commitMessage,
      contentSnapshot: contentResult.content,
    });
    return { code: "database_error" };
  }

  if (dbResult !== "committed" && dbResult !== "already_committed") {
    return { code: dbResult };
  }

  return {
    code: dbResult,
    commitSha: commitResult.commitSha,
    commitUrl: commitResult.commitUrl,
    branch: missionBranch,
    filePath,
    repositoryFullName: taskRow.repositoryFullName,
  };
}
