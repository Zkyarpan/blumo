import type { MissionOutput } from "./mission-output.schema";

export type MissionReviewStatus =
  | "generated"
  | "approved"
  | "rejected"
  | "in_progress"
  | "completed";

export type ReviewOperationStatus = "idle" | "regenerating";

export type MissionVersionStatus = "generated" | "approved" | "rejected";

export interface MissionVersion {
  id: string;
  taskId: string;
  userId: string;
  versionNumber: number;
  status: MissionVersionStatus;
  title: string;
  description: string;
  estimatedMinutes: 10 | 20 | 30 | 45 | 60;
  difficulty: "beginner" | "intermediate" | "advanced";
  acceptanceChecklist: string[];
  suggestedCommitMessage: string;
  suggestedBranch: string;
  learningOutcome: string;
  aiProvider: string;
  promptVersion: string;
  generationClaimVersion: number;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
}

export interface MissionReviewTask {
  id: string;
  userId: string;
  scheduledDate: string;
  status: MissionReviewStatus;
  reviewOperationStatus: ReviewOperationStatus;
  regenerationCount: number;
  approvedAt: string | null;
  rejectedAt: string | null;
  currentMissionVersionId: string | null;
  repositoryFullName: string | null;
  repositoryAccessStatus: string | null;
  installationStatus: string | null;
}

export interface MissionReviewReadModel {
  task: MissionReviewTask;
  currentVersion: MissionVersion;
}

export type MissionReviewResult =
  | { kind: "found"; data: MissionReviewReadModel }
  | { kind: "not_found" }
  | { kind: "invalid" }
  | { kind: "error" };

// --- Action result codes ---

export type ApproveResultCode =
  | "approved"
  | "already_approved"
  | "not_found"
  | "repository_unavailable"
  | "stale_version"
  | "invalid_transition"
  | "unauthorized"
  | "invalid_request"
  | "database_error";

export type RejectResultCode =
  | "rejected"
  | "already_rejected"
  | "not_found"
  | "stale_version"
  | "invalid_transition"
  | "unauthorized"
  | "invalid_request"
  | "database_error";

export type RegenerateResultCode =
  | "claimed"
  | "duplicate"
  | "duplicate_succeeded"
  | "not_found"
  | "repository_unavailable"
  | "stale_version"
  | "invalid_transition"
  | "usage_limit_reached"
  | "unauthorized"
  | "invalid_request"
  | "provider_error"
  | "database_error";

export interface ApproveActionInput {
  taskId: string;
  versionId: string;
}

export interface RejectActionInput {
  taskId: string;
  versionId: string;
  reason: string | null;
}

export interface RegenerateActionInput {
  taskId: string;
  sourceVersionId: string;
  feedback: string;
}

/** Full regeneration prompt context passed to the provider. */
export interface RegenerationPromptContext {
  profile: { experience_level: string; timezone: string };
  goal: {
    title: string;
    technology: string;
    task_type: string;
    daily_minutes: number;
  };
  repository: {
    name: string;
    default_branch: string;
    is_private: boolean;
  };
  previousCompletedMissions: Array<{
    title: string;
    learning_outcome: string;
    difficulty: string;
    scheduled_date: string;
  }>;
  rejectedMission: MissionOutput;
  feedback: string;
}
