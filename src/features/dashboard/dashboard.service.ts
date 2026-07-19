import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardData = {
  profile: {
    id: string;
    display_name: string | null;
    github_username: string | null;
    avatar_url: string | null;
    experience_level: string | null;
    timezone: string | null;
    onboarding_completed_at: string | null;
  };
  activeGoal: {
    id: string;
    title: string;
    technology: string;
    task_type: string;
    daily_minutes: number;
    status: string;
    created_at: string;
  } | null;
  completedTaskCount: number;
  installationStatus: "active" | "suspended" | "uninstalled" | null;
  selectedRepository: {
    id: string;
    full_name: string;
    default_branch: string;
  } | null;
};

/**
 * Fetches all data the dashboard needs in one call.
 *
 * - Returns null if the profile row is missing or a critical query throws.
 * - Returns DashboardData with activeGoal: null when no active goal exists.
 * - Returns DashboardData with completedTaskCount: 0 when there are no
 *   committed tasks.
 * - Uses the anon-key server client so RLS is enforced; never uses the
 *   service-role key for user-owned reads.
 * - Does not throw — callers receive null on any unexpected failure.
 */
export async function getDashboardData(
  userId: string
): Promise<DashboardData | null> {
  try {
    const supabase = await createSupabaseServerClient();

    // 1. Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, display_name, github_username, avatar_url, experience_level, timezone, onboarding_completed_at"
      )
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      return null;
    }

    // 2. Fetch active goal (soft failure — return null goal, not null data)
    let activeGoal: DashboardData["activeGoal"] = null;
    const { data: goalData, error: goalError } = await supabase
      .from("goals")
      .select("id, title, technology, task_type, daily_minutes, status, created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!goalError && goalData) {
      activeGoal = goalData;
    }

    // 3. Count committed tasks (soft failure — default 0)
    let completedTaskCount = 0;
    const { count, error: countError } = await supabase
      .from("daily_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "committed");

    if (!countError && typeof count === "number") {
      completedTaskCount = count;
    }

    // 4. Fetch the latest verified GitHub installation state. A query error is
    // critical because presenting it as disconnected would fabricate status.
    let installationStatus: DashboardData["installationStatus"] = null;
    let activeInstallationId: string | null = null;
    const { data: installationData, error: installationError } = await supabase
      .from("github_installations")
      .select("id, status")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (installationError) return null;

    if (installationData) {
      if (
        installationData.status !== "active" &&
        installationData.status !== "suspended" &&
        installationData.status !== "uninstalled"
      ) {
        return null;
      }

      installationStatus = installationData.status;
      if (installationStatus === "active") {
        activeInstallationId = installationData.id;
      }
    }

    // 5. Fetch the one selected active repository for that installation.
    let selectedRepository: DashboardData["selectedRepository"] = null;

    if (activeInstallationId) {
      const { data: repositoryData, error: repositoryError } = await supabase
        .from("repositories")
        .select("id, full_name, default_branch")
        .eq("user_id", userId)
        .eq("installation_id", activeInstallationId)
        .eq("is_selected", true)
        .eq("access_status", "active")
        .limit(1)
        .maybeSingle();

      if (!repositoryError && repositoryData) {
        selectedRepository = repositoryData;
      }
    }

    return {
      profile,
      activeGoal,
      completedTaskCount,
      installationStatus,
      selectedRepository,
    };
  } catch {
    return null;
  }
}
