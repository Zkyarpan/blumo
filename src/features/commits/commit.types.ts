// --------------------------------------------------------------------------
// Unit 12: Commit feature types
// --------------------------------------------------------------------------

/** Result codes returned from the commit action. */
export type CommitResultCode =
  | "committed"
  | "already_committed"
  | "not_found"
  | "invalid_transition"
  | "repository_unavailable"
  | "installation_suspended"
  | "invalid_branch"
  | "invalid_path"
  | "content_too_large"
  | "branch_conflict"
  | "file_conflict"
  | "permission_changed"
  | "github_unavailable"
  | "unauthorized"
  | "invalid_request"
  | "database_error";

/** Extended result from executeCommit that includes commit details on success. */
export type ExecuteCommitResult =
  | {
      code: "committed";
      commitSha: string;
      commitUrl: string;
      branch: string;
      filePath: string;
      repositoryFullName: string;
    }
  | { code: CommitResultCode };

/** Props passed to the CommitProposal presentation component. */
export interface CommitProposalData {
  taskId: string;
  operationId: string;
  repositoryFullName: string;
  baseBranch: string;
  proposedBranch: string;
  proposedPath: string;
  proposedContent: string;
  commitMessage: string;
  missionTitle: string;
  scheduledDate: string;
}

/** State shown after a commit attempt. */
export interface CommitSuccessData {
  commitSha: string;
  commitUrl: string;
  branch: string;
  filePath: string;
}

/** The read model returned to the page. */
export type CommitProposalResult =
  | { kind: "proposal"; data: CommitProposalData }
  | { kind: "already_committed"; commitSha: string; commitUrl: string; branch: string; filePath: string }
  | { kind: "not_found" }
  | { kind: "not_approved" }
  | { kind: "repository_unavailable" }
  | { kind: "installation_suspended" }
  | { kind: "error" };

/** Minimum task row needed to compute the commit proposal. */
export interface CommitProposalTaskRow {
  id: string;
  userId: string;
  scheduledDate: string;
  status: string;
  currentMissionVersionId: string | null;
  repositoryId: string;
  repositoryFullName: string;
  repositoryDefaultBranch: string;
  repositoryAccessStatus: string;
  installationId: string;
  installationGithubId: number;
  installationStatus: string;
}

/** Minimum approved mission_versions row needed for commit. */
export interface CommitProposalVersionRow {
  id: string;
  taskId: string;
  userId: string;
  versionNumber: number;
  status: string;
  title: string;
  description: string;
  acceptanceChecklist: string[];
  suggestedCommitMessage: string;
  learningOutcome: string;
  aiProvider: string;
}
