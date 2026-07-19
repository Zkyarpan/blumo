"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/features/auth/get-user";
import {
  logSafeValidationFailure,
  summarizeZodIssues,
} from "@/lib/validation/safe-validation-diagnostics";
import { generateMissionForUser } from "./mission-generation.service";
import type { MissionActionState } from "./mission-generation.types";

const missionActionInputSchema = z.object({}).strict();

function validateActionFormData(formData: FormData): boolean {
  const submittedFields = Array.from(new Set(formData.keys())).filter(
    (field) => !field.startsWith("$ACTION_")
  );
  const input = Object.fromEntries(submittedFields.map((field) => [field, true]));
  const result = missionActionInputSchema.safeParse(input);

  if (!result.success) {
    logSafeValidationFailure({
      stage: "action_input",
      ...summarizeZodIssues(result.error.issues),
      category: "unexpected_client_fields",
    });
  }

  return result.success;
}

export async function generateMissionAction(
  _previousState: MissionActionState,
  formData: FormData
): Promise<MissionActionState> {
  const user = await getUser();
  if (!user) {
    return { ok: false, code: "unauthorized", retryable: false };
  }

  if (!validateActionFormData(formData)) {
    return { ok: false, code: "invalid_request", retryable: false };
  }

  const result = await generateMissionForUser(user.id);
  revalidatePath("/dashboard");
  return result;
}
