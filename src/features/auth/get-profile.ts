import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Fetches minimal profile data for the authenticated user.
 * Returns null if the user is not signed in or no profile row exists.
 *
 * Used by the proxy and onboarding page to check onboarding status.
 * Selects only the columns needed to avoid over-fetching.
 */
export async function getProfile() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, onboarding_completed_at, experience_level, timezone, display_name, avatar_url, github_username")
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
