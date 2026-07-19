"use server";

import { onboardingSchema } from "./onboarding.schema";
import { saveOnboarding } from "./onboarding.service";
import { getUser } from "@/features/auth/get-user";
import type { ActionResult } from "@/types/action-result";

/**
 * Server Action: validates and persists onboarding form data.
 *
 * Called via useActionState from OnboardingForm.
 * On success, returns {ok: true} — the client handles navigation to /dashboard.
 * On failure, returns a normalized ActionResult the client can render.
 *
 * Note: redirect() is NOT called here because useActionState + startTransition
 * does not propagate Next.js redirect throws to the browser in all cases.
 * Client-side router.push() is used instead (see OnboardingForm).
 */
export async function submitOnboarding(
  _prev: ActionResult<null>,
  formData: FormData
): Promise<ActionResult<null>> {
  const user = await getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "You must be signed in." },
    };
  }

  const raw = {
    title: formData.get("title"),
    technology: formData.get("technology"),
    experience_level: formData.get("experience_level"),
    daily_minutes: formData.get("daily_minutes"),
    task_type: formData.get("task_type"),
    timezone: formData.get("timezone"),
  };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please fix the errors and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<
          string,
          string[]
        >,
      },
    };
  }

  const result = await saveOnboarding(user.id, parsed.data);
  if (!result.ok) return result;

  return { ok: true, data: null };
}
