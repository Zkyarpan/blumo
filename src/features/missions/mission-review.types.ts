import type { MissionOutput } from "./mission-output.schema";

export type MissionReviewErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_request"
  | "invalid_transition"
  | "already_approved"
  | "already_rejected"
  | "stale_version"
  | "repository_unavailable"
  | "usage_limit_reached"
  | "processing"
  | "context_changed"
  | "database_error"
  | "configuration_error"
  | "authentication_error"
  | "quota_exhausted"
  | "rate_limited"
  | "request_rejected"
  | "content_rejected"
  | "invalid_response"
  | "unsafe_response"
  | "timed_out"
  | "temporarily_unavailable"
  | "unknown_provider_error";

/** Review model returned to the page — contains only what the user needs. */
export interface MissionReviewModel {
  taskId: string;
  scheduledDate: string;
  status: "generated" | "approved" | "rejected" | "in_progress" | "completed";
  reviewOperationStatus: "idle" | "regenerating";
  currentVersionNumber: number;
  currentVersionId: string;
  versionCreatedAt: string;
  regenerationCount: number;
  mission: MissionOutput;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  repository: {
    fullName: string;
    isAvailable: boolean;
  } | null;
}

export type MissionApprovalResult =
  | { ok: true; code: "approved" | "already_approved" }
  | { ok: false; code: MissionReviewErrorCode };

export type MissionRejectionResult =
  | { ok: true; code: "rejected" | "already_rejected" }
  | { ok: false; code: MissionReviewErrorCode };

export type MissionRegenerationResult =
  | { ok: true; code: "claimed" | "processing" | "already_succeeded" }
  | { ok: false; code: MissionReviewErrorCode };

/** Action state passed through useFormState for approval */
export type ApproveActionState =
  | { ok: true; code: "approved" | "already_approved" }
  | { ok: false; code: MissionReviewErrorCode }
  | null;

/** Action state passed through useFormState for rejection */
export type RejectActionState =
  | {
      ok: true;
      code: "rejected" | "already_rejected";
    }
  | {
      ok: false;
      code: MissionReviewErrorCode;
      fieldError?: string;
    }
  | null;

/** Action state passed through useFormState for regeneration */
export type RegenerateActionState =
  | { ok: true; code: "claimed" | "processing" | "already_succeeded" }
  | {
      ok: false;
      code: MissionReviewErrorCode;
      fieldError?: string;
    }
  | null;
