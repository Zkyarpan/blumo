import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OnboardingInput } from "./onboarding.schema";
import type { ActionResult } from "@/types/action-result";

/**
 * Persists the onboarding form data for the given authenticated user.
 *
 * Write order:
 *   1. UPDATE profiles — experience_level, timezone
 *   2. INSERT goals    — active goal with user's preferences
 *   3. UPDATE profiles — set onboarding_completed_at (sentinel, last)
 *
 * The sentinel is set last so a partial failure leaves the user able to retry.
 * If an active goal already exists from a previous partial attempt, we detect
 * it and complete the sentinel rather than inserting a duplicate.
 */
export async function saveOnboarding(
  userId: string,
  input: OnboardingInput
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  // Guard: check for an existing active goal to prevent duplicates.
  const { data: existingGoal } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existingGoal) {
    // Check whether onboarding was already completed.
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", userId)
      .single();

    if (profile?.onboarding_completed_at) {
      // Already complete — proxy should have redirected, but be defensive.
      return {
        ok: false,
        error: {
          code: "ALREADY_ONBOARDED",
          message: "Onboarding is already complete.",
        },
      };
    }

    // Partial write from a previous attempt: active goal exists but the
    // sentinel was not set. Complete it now.
    const { error: completeError } = await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", userId);

    if (completeError) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: "Something went wrong. Please try again.",
        },
      };
    }

    return { ok: true, data: null };
  }

  // Step 1: Update profile preferences.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      experience_level: input.experience_level,
      timezone: input.timezone,
    })
    .eq("id", userId);

  if (profileError) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Could not save your preferences. Please try again.",
      },
    };
  }

  // Step 2: Create the active goal.
  const { error: goalError } = await supabase.from("goals").insert({
    user_id: userId,
    title: input.title,
    technology: input.technology,
    task_type: input.task_type,
    daily_minutes: input.daily_minutes,
    status: "active",
  });

  if (goalError) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Could not save your goal. Please try again.",
      },
    };
  }

  // Step 3: Mark onboarding complete — only after all other writes succeed.
  const { error: completeError } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId);

  if (completeError) {
    // Goal was created but the sentinel was not set.
    // The next attempt will detect the existing goal and complete the sentinel.
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Almost done — please try submitting one more time.",
      },
    };
  }

  return { ok: true, data: null };
}
