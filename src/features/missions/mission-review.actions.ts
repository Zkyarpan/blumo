"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/features/auth/get-user";
import {
  approveActionInputSchema,
  rejectActionInputSchema,
  regenerateActionInputSchema,
  validateRejectionReason,
  validateRegenerationFeedback,
  parseActionFormData,
} from "./mission-review.schema";
import {
  approveMission,
  rejectMission,
  regenerateMission,
} from "./mission-review.service";
import type {
  ApproveActionState,
  RejectActionState,
  RegenerateActionState,
} from "./mission-review.types";

function reviewPath(taskId: string): string {
  return `/tasks/${taskId}/review`;
}
function taskPath(taskId: string): string {
  return `/tasks/${taskId}`;
}

export async function approveMissionAction(
  _previousState: ApproveActionState,
  formData: FormData
): Promise<ApproveActionState> {
  const user = await getUser();
  if (!user) {
    return { ok: false, code: "unauthorized" };
  }

  const parsed = parseActionFormData(formData, approveActionInputSchema);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_request" };
  }

  const { taskId, expectedVersionNumber } = parsed.data;
  const result = await approveMission(user.id, taskId, expectedVersionNumber);

  if (result.ok) {
    revalidatePath(reviewPath(taskId));
    revalidatePath("/dashboard");
    revalidatePath(taskPath(taskId));
    redirect(taskPath(taskId));
  }

  return result;
}

export async function rejectMissionAction(
  _previousState: RejectActionState,
  formData: FormData
): Promise<RejectActionState> {
  const user = await getUser();
  if (!user) {
    return { ok: false, code: "unauthorized" };
  }

  const parsed = parseActionFormData(formData, rejectActionInputSchema);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_request" };
  }

  const { taskId, expectedVersionNumber, reason: rawReason } = parsed.data;

  const reasonResult = validateRejectionReason(rawReason);
  if (!reasonResult.ok) {
    return { ok: false, code: "invalid_request", fieldError: reasonResult.error };
  }

  const result = await rejectMission(user.id, taskId, expectedVersionNumber, reasonResult.reason);

  if (result.ok) {
    revalidatePath(reviewPath(taskId));
    revalidatePath("/dashboard");
  }

  return result;
}

export async function regenerateMissionAction(
  _previousState: RegenerateActionState,
  formData: FormData
): Promise<RegenerateActionState> {
  const user = await getUser();
  if (!user) {
    return { ok: false, code: "unauthorized" };
  }

  const parsed = parseActionFormData(formData, regenerateActionInputSchema);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_request" };
  }

  const { taskId, expectedVersionNumber, feedback: rawFeedback } = parsed.data;

  const feedbackResult = validateRegenerationFeedback(rawFeedback);
  if (!feedbackResult.ok) {
    return { ok: false, code: "invalid_request", fieldError: feedbackResult.error };
  }

  const result = await regenerateMission(
    user.id,
    taskId,
    expectedVersionNumber,
    feedbackResult.feedback
  );

  if (result.ok) {
    revalidatePath(reviewPath(taskId));
    revalidatePath("/dashboard");
  }

  return result;
}
