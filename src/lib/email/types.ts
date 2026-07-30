import "server-only";

// --------------------------------------------------------------------------
// Email event types — typed business events that map to templates
// --------------------------------------------------------------------------

export type EmailEventType =
  | "welcome"
  | "mission_generated"
  | "mission_approved"
  | "mission_rejected"
  | "mission_regenerated"
  | "github_commit_success"
  | "github_commit_recoverable_failure"
  | "github_installation_suspended"
  | "github_installation_uninstalled"
  | "repository_access_removed"
  | "weekly_progress"
  | "support_acknowledgement"
  | "test_email"
  | "auto_commit_success";

// --------------------------------------------------------------------------
// Normalized send result
// --------------------------------------------------------------------------

export type EmailErrorCode =
  | "configuration_error"
  | "invalid_recipient"
  | "unauthorized"
  | "domain_not_verified"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_error"
  | "database_error"
  | "unknown_error";

/** User-facing messages for each error code — never expose internal details. */
export const EMAIL_ERROR_MESSAGES: Record<EmailErrorCode, string> = {
  configuration_error: "Email delivery is not configured yet.",
  invalid_recipient: "We could not verify the destination email address.",
  unauthorized: "Please sign in again before sending this email.",
  domain_not_verified: "Blumo's sending domain is not ready yet.",
  rate_limited: "Too many email requests were made. Please wait and try again.",
  provider_unavailable: "Email delivery is temporarily unavailable.",
  provider_error: "Email delivery is temporarily unavailable.",
  database_error: "The email status could not be saved safely.",
  unknown_error: "Blumo could not send the email.",
};

export type EmailSendResult =
  | { ok: true; messageId: string; emailType: EmailEventType }
  | { ok: false; code: EmailErrorCode; message: string; retryable: boolean };

// --------------------------------------------------------------------------
// Safe diagnostics (logged internally — no secrets)
// --------------------------------------------------------------------------

export interface EmailDiagnostics {
  emailType: EmailEventType;
  provider: "resend";
  providerStatus?: number;
  providerErrorName?: string;
  providerErrorCode?: string;
  retryable: boolean;
  recipientCount: number;
  operationId: string;
}

// --------------------------------------------------------------------------
// Typed email request payloads
// --------------------------------------------------------------------------

export interface WelcomeEmailData {
  recipientEmail: string;
  recipientName: string;
  goal: string;
}

export interface MissionGeneratedEmailData {
  recipientEmail: string;
  recipientName: string;
  missionTitle: string;
  taskId: string;
}

export interface MissionApprovedEmailData {
  recipientEmail: string;
  recipientName: string;
  missionTitle: string;
  taskId: string;
}

export interface MissionRejectedEmailData {
  recipientEmail: string;
  recipientName: string;
  missionTitle: string;
  taskId: string;
}

export interface MissionRegeneratedEmailData {
  recipientEmail: string;
  recipientName: string;
  missionTitle: string;
  taskId: string;
}

export interface CommitSuccessEmailData {
  recipientEmail: string;
  recipientName: string;
  missionTitle: string;
  repositoryFullName: string;
  branch: string;
  filePath: string;
  commitMessage: string;
  commitUrl: string;
  commitSha: string;
  taskId: string;
}

export interface CommitRecoverableFailureEmailData {
  recipientEmail: string;
  recipientName: string;
  missionTitle: string;
  repositoryFullName: string;
  taskId: string;
}

export interface InstallationSuspendedEmailData {
  recipientEmail: string;
  recipientName: string;
  accountLogin: string;
}

export interface InstallationUninstalledEmailData {
  recipientEmail: string;
  recipientName: string;
  accountLogin: string;
}

export interface RepositoryAccessRemovedEmailData {
  recipientEmail: string;
  recipientName: string;
  repositoryFullName: string;
}

export interface WeeklyProgressEmailData {
  recipientEmail: string;
  recipientName: string;
  completedCount: number;
  weekLabel: string;
}

export interface SupportAcknowledgementEmailData {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  ticketId: string;
}

export interface TestEmailData {
  recipientEmail: string;
  recipientName: string;
}

export interface AutoCommitSuccessEmailData {
  recipientEmail: string;
  recipientName: string;
  missionTitle: string;
  repositoryFullName: string;
  branch: string;
  filePath: string;
  commitUrl: string;
  commitSha: string;
  taskId: string;
}
