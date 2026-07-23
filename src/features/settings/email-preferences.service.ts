import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface EmailPreferences {
  emailMissionGenerated: boolean;
  emailMissionApproved: boolean;
  emailMissionRejected: boolean;
  emailCommitSuccess: boolean;
  emailGithubConnection: boolean;
  emailWeeklyProgress: boolean;
}

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  emailMissionGenerated: true,
  emailMissionApproved: true,
  emailMissionRejected: true,
  emailCommitSuccess: true,
  emailGithubConnection: true,
  emailWeeklyProgress: false,
};

// --------------------------------------------------------------------------
// Read
// --------------------------------------------------------------------------

/**
 * Returns the user's email preferences, or the defaults when no row exists.
 * Uses the anon client so RLS is enforced.
 */
export async function getEmailPreferences(
  userId: string
): Promise<EmailPreferences | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("email_preferences")
      .select(
        "email_mission_generated, email_mission_approved, email_mission_rejected, email_commit_success, email_github_connection, email_weekly_progress"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return null;
    if (!data) return { ...DEFAULT_EMAIL_PREFERENCES };

    return {
      emailMissionGenerated: data.email_mission_generated ?? true,
      emailMissionApproved: data.email_mission_approved ?? true,
      emailMissionRejected: data.email_mission_rejected ?? true,
      emailCommitSuccess: data.email_commit_success ?? true,
      emailGithubConnection: data.email_github_connection ?? true,
      emailWeeklyProgress: data.email_weekly_progress ?? false,
    };
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Write — uses service-role RPC so the function runs with security definer
// --------------------------------------------------------------------------

export async function saveEmailPreferences(
  userId: string,
  prefs: EmailPreferences
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc("upsert_email_preferences", {
      p_user_id: userId,
      p_email_mission_generated: prefs.emailMissionGenerated,
      p_email_mission_approved: prefs.emailMissionApproved,
      p_email_mission_rejected: prefs.emailMissionRejected,
      p_email_commit_success: prefs.emailCommitSuccess,
      p_email_github_connection: prefs.emailGithubConnection,
      p_email_weekly_progress: prefs.emailWeeklyProgress,
    });

    if (error) {
      return { ok: false, message: "Could not save preferences. Please try again." };
    }

    return { ok: true };
  } catch {
    return { ok: false, message: "Could not save preferences. Please try again." };
  }
}
