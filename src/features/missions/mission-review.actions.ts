"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/features/auth/get-user";
import {
  logSafeValidationFailure,
  summarizeZodIssues,
} from "@/lib/validation/safe-validation-diagnostics";
import {
  rejectionReasonSchema,
  feedbackSchema,
  approveActionSchema,
  rejectActionSchema,
  regenerateActionSchema,
} from "./mission-review.schema";
import {
  approveMission,
  rejectMission,
  regenerateMission,
} from "./mission-review.service";
import type {
  ApproveResultCode,
  RejectResultCode,
  RegenerateResultCode,
} from "./mission-review.types";
import type { ActionResult } from "@/types/action-result";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const NEXT_ACTION_FIELDS = /^\$ACTION_/;

function extractNonFrameworkFields(
  formData: FormData
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!NEXT_ACTION_FIELDS.test(key)) {
      result[key] = typeof value === "string" ? value : "";
    }
  }
  return result;
}

// --------------------------------------------------------------------------
// Approve
// --------------------------------------------------------------------------

export type ApproveActionState = ActionResult<{ code: ApproveResultCode }> | null;

export async function approveMissionAction(
  _prev: ApproveActionState,
  formData: FormData
): Promise<ApproveActionState> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: { code: "unauthorized", message: "Not authenticated." } };
  }

  const fields = extractNonFrameworkFields(formData);
  const parsed = approveActionSchema.safeParse(fields);
  if (!parsed.success) {
    logSafeValidationFailure({
      stage: "approve_action_input",
      ...summarizeZodIssues(parsed.error.issues),
      category: "unexpected_client_fields",
    });
    return { ok: false, error: { code: "invalid_request", message: "Invalid request." } };
  }

  const { taskId, versionId } = parsed.data;
  const result = await approveMission(user.id, taskId, versionId);

  if (result === "approved" || result === "already_approved") {
    revalidatePath(`/tasks/${taskId}/review`);
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/dashboard");
    return { ok: true, data: { code: result } };
  }

  const errorMessages: Record<ApproveResultCode, string> = {
    approved: "Mission approved.",
    already_approved: "Mission was already approved.",
    not_found: "Mission not found.",
    repository_unavailable:
      "Your repository is no longer accessible. Restore access to approve this mission.",
    stale_version:
      "The mission changed in another tab. Refresh and try again.",
    invalid_transition: "This mission cannot be approved in its current state.",
    unauthorized: "Not authenticated.",
    invalid_request: "Invalid request.",
    database_error: "A temporary error occurred. Please try again.",
  };

  return {
    ok: false,
    error: {
      code: result,
      message: errorMessages[result] ?? "Unexpected error.",
    },
  };
}

// --------------------------------------------------------------------------
// Reject
// --------------------------------------------------------------------------

export type RejectActionState = ActionResult<{ code: RejectResultCode }> | null;

export async function rejectMissionAction(
  _prev: RejectActionState,
  formData: FormData
): Promise<RejectActionState> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: { code: "unauthorized", message: "Not authenticated." } };
  }

  const fields = extractNonFrameworkFields(formData);
  const parsed = rejectActionSchema.safeParse(fields);
  if (!parsed.success) {
    logSafeValidationFailure({
      stage: "reject_action_input",
      ...summarizeZodIssues(parsed.error.issues),
      category: "unexpected_client_fields",
    });
    return { ok: false, error: { code: "invalid_request", message: "Invalid request." } };
  }

  const { taskId, versionId } = parsed.data;

  // Validate optional rejection reason
  let sanitizedReason: string | null = null;
  const rawReason = fields.reason ?? "";
  if (rawReason.trim().length > 0) {
    const reasonParsed = rejectionReasonSchema.safeParse(rawReason);
    if (!reasonParsed.success) {
      return {
        ok: false,
        error: {
          code: "invalid_request",
          message: "Invalid rejection reason.",
          fieldErrors: { reason: reasonParsed.error.issues.map((i) => i.message) },
        },
      };
    }
    sanitizedReason = reasonParsed.data;
  }

  const result = await rejectMission(user.id, taskId, versionId, sanitizedReason);

  if (result === "rejected" || result === "already_rejected") {
    revalidatePath(`/tasks/${taskId}/review`);
    revalidatePath("/dashboard");
    return { ok: true, data: { code: result } };
  }

  const errorMessages: Record<RejectResultCode, string> = {
    rejected: "Mission rejected.",
    already_rejected: "Mission was already rejected.",
    not_found: "Mission not found.",
    stale_version:
      "The mission changed in another tab. Refresh and try again.",
    invalid_transition: "This mission cannot be rejected in its current state.",
    unauthorized: "Not authenticated.",
    invalid_request: "Invalid request.",
    database_error: "A temporary error occurred. Please try again.",
  };

  return {
    ok: false,
    error: {
      code: result,
      message: errorMessages[result] ?? "Unexpected error.",
    },
  };
}

// --------------------------------------------------------------------------
// Regenerate
// --------------------------------------------------------------------------

export type RegenerateActionState =
  | ActionResult<{ code: RegenerateResultCode }>
  | null;

export async function regenerateMissionAction(
  _prev: RegenerateActionState,
  formData: FormData
): Promise<RegenerateActionState> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: { code: "unauthorized", message: "Not authenticated." } };
  }

  const fields = extractNonFrameworkFields(formData);
  const parsed = regenerateActionSchema.safeParse(fields);
  if (!parsed.success) {
    logSafeValidationFailure({
      stage: "regenerate_action_input",
      ...summarizeZodIssues(parsed.error.issues),
      category: "unexpected_client_fields",
    });
    return { ok: false, error: { code: "invalid_request", message: "Invalid request." } };
  }

  // Validate feedback
  const feedbackParsed = feedbackSchema.safeParse(parsed.data.feedback);
  if (!feedbackParsed.success) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid feedback.",
        fieldErrors: {
          feedback: feedbackParsed.error.issues.map((i) => i.message),
        },
      },
    };
  }

  const { taskId, sourceVersionId } = parsed.data;
  const result = await regenerateMission(
    user.id,
    taskId,
    sourceVersionId,
    feedbackParsed.data
  );

  if (result === "claimed") {
    revalidatePath(`/tasks/${taskId}/review`);
    revalidatePath("/dashboard");
    return { ok: true, data: { code: result } };
  }

  const errorMessages: Record<RegenerateResultCode, string> = {
    claimed: "Replacement mission created.",
    duplicate: "A replacement is already in progress.",
    duplicate_succeeded:
      "A replacement was already created. Refresh to see it.",
    not_found: "Mission not found.",
    repository_unavailable:
      "Your repository is no longer accessible. Restore access to regenerate.",
    stale_version:
      "The mission changed in another tab. Refresh and try again.",
    invalid_transition:
      "This mission cannot be regenerated in its current state.",
    usage_limit_reached:
      "No more replacements are available for this mission.",
    unauthorized: "Not authenticated.",
    invalid_request: "Invalid request.",
    provider_error:
      "The AI provider encountered an error. Try again in a moment.",
    database_error: "A temporary error occurred. Please try again.",
  };

  return {
    ok: false,
    error: {
      code: result,
      message: errorMessages[result] ?? "Unexpected error.",
    },
  };
}
