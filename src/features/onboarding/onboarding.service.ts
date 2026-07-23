import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OnboardingInput } from "./onboarding.schema";
import type { ActionResult } from "@/types/action-result";

/**
 * Persists the onboarding form data for the given authenticated user.
 *
 * Write order:
 *   1. UPSERT profiles — GitHub fields + experience_level + timezone
 *   2. INSERT goals    — active goal with user's preferences
 *   3. UPDATE profiles — set onboarding_completed_at (sentinel, last)
 *
 * Step 1 uses upsert so that if the handle_new_user() trigger was delayed
 * or failed, the profiles row is created here with all GitHub metadata.
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

  // Step 1: Upsert profile with GitHub metadata + preferences.
  // Pulls GitHub fields from the auth session so that if the
  // handle_new_user() trigger failed, the row is fully populated here.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const meta = authUser?.user_metadata ?? {};

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        // GitHub identity — only set when not already populated
        github_user_id: meta.provider_id
          ? parseInt(meta.provider_id as string, 10)
          : undefined,
        github_username: (meta.user_name as string | undefined) ?? undefined,
        display_name:
          ((meta.full_name as string | undefined) ||
            (meta.user_name as string | undefined)) ??
          undefined,
        avatar_url: (meta.avatar_url as string | undefined) ?? undefined,
        // User preferences from the form
        experience_level: input.experience_level,
        timezone: input.timezone,
      },
      { onConflict: "id" }
    );

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

  // Welcome email — fire-and-forget after successful onboarding.
  // Email failure never rolls back the onboarding transaction.
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();
  if (sessionUser?.email) {
    const recipientEmail = sessionUser.email;
    const { data: goalForEmail } = await supabase
      .from("goals")
      .select("title")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    void import("@/lib/email/send-welcome")
      .then(({ sendWelcomeEmail }) =>
        sendWelcomeEmail({
          recipientEmail,
          recipientName:
            (sessionUser.user_metadata?.full_name as string | undefined) ??
            (sessionUser.user_metadata?.user_name as string | undefined) ??
            recipientEmail,
          goal: goalForEmail?.title ?? input.title,
        })
      )
      .catch(() => {
        // Best-effort; never throw from email send or module initialization.
      });
  }

  return { ok: true, data: null };
}
