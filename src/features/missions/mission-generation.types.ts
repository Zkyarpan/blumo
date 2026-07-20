import type { ExperienceLevel } from "@/features/onboarding/onboarding.schema";

export type MissionErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_onboarded"
  | "invalid_timezone"
  | "no_active_goal"
  | "no_active_repository"
  | "context_changed"
  | "retry_exhausted"
  | "retry_not_allowed"
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
  | "unknown_provider_error"
  | "database_error";

export interface PreviousCompletedMission {
  title: string;
  learning_outcome: string;
  difficulty: ExperienceLevel;
  scheduled_date: string;
}

export interface MissionPromptContext {
  profile: {
    experience_level: ExperienceLevel;
    timezone: string;
  };
  goal: {
    title: string;
    technology: string;
    task_type:
      | "learning_note"
      | "coding_challenge"
      | "documentation"
      | "interview_preparation";
    daily_minutes: 10 | 20 | 30 | 45 | 60;
  };
  repository: {
    name: string;
    default_branch: string;
    is_private: boolean;
  };
  previous_completed_missions: PreviousCompletedMission[];
  scheduled_date: string;
}

export interface SavedMission {
  id: string;
  scheduledDate: string;
  title: string;
  description: string;
  estimatedMinutes: 10 | 20 | 30 | 45 | 60;
  difficulty: ExperienceLevel;
  acceptanceChecklist: string[];
  suggestedCommitMessage: string;
  suggestedBranch: string;
  learningOutcome: string;
  status:
    | "generated"
    | "approved"
    | "rejected"
    | "in_progress"
    | "completed";
  generationAttempts: number;
  repositoryName: string;
}

export type MissionGenerationResult =
  | {
      ok: true;
      status: "generated" | "existing" | "in_progress";
      taskId: string;
    }
  | {
      ok: false;
      code: MissionErrorCode;
      retryable: boolean;
      taskId?: string;
    };

export type MissionActionState = MissionGenerationResult | null;
