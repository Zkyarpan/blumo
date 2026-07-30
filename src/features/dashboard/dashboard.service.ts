import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTodayMission,
  type TodayMissionState,
} from "@/features/missions/mission-generation.repository";
import { getUserLocalDate } from "@/features/missions/mission-date";

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
    name: string;
    full_name: string;
    default_branch: string;
  } | null;
  todayMission: TodayMissionState;
};

export async function getDashboardData(
  userId: string
): Promise<DashboardData | null> {
  try {
    const supabase = await createSupabaseServerClient();

    // 1. Profile first — needed for timezone before parallelising the rest
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, display_name, github_username, avatar_url, experience_level, timezone, onboarding_completed_at"
      )
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) return null;

    // 2. Parallelise all remaining independent queries
    const localDate = getUserLocalDate(new Date(), profile.timezone);

    const [
      goalResult,
      countResult,
      installationResult,
      todayMission,
    ] = await Promise.all([
      // Active goal
      supabase
        .from("goals")
        .select("id, title, technology, task_type, daily_minutes, status, created_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),

      // Completed task count
      supabase
        .from("daily_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "completed"),

      // GitHub installation
      supabase
        .from("github_installations")
        .select("id, status")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Today's mission (uses its own client call internally)
      localDate
        ? getOwnedTodayMission(userId, localDate).catch(() => ({ kind: "invalid" } as TodayMissionState))
        : Promise.resolve({ kind: "none" } as TodayMissionState),
    ]);

    // Process goal
    const activeGoal = !goalResult.error && goalResult.data ? goalResult.data : null;

    // Process count
    const completedTaskCount =
      !countResult.error && typeof countResult.count === "number"
        ? countResult.count
        : 0;

    // Process installation — critical, return null on error
    if (installationResult.error) return null;

    let installationStatus: DashboardData["installationStatus"] = null;
    let activeInstallationId: string | null = null;

    if (installationResult.data) {
      const s = installationResult.data.status;
      if (s !== "active" && s !== "suspended" && s !== "uninstalled") return null;
      installationStatus = s;
      if (s === "active") activeInstallationId = installationResult.data.id;
    }

    // 3. Selected repository — only needed when installation is active
    let selectedRepository: DashboardData["selectedRepository"] = null;
    if (activeInstallationId) {
      const { data: repoData, error: repoError } = await supabase
        .from("repositories")
        .select("id, name, full_name, default_branch")
        .eq("user_id", userId)
        .eq("installation_id", activeInstallationId)
        .eq("is_selected", true)
        .eq("access_status", "active")
        .limit(1)
        .maybeSingle();

      if (!repoError && repoData) selectedRepository = repoData;
    }

    return {
      profile,
      activeGoal,
      completedTaskCount,
      installationStatus,
      selectedRepository,
      todayMission,
    };
  } catch {
    return null;
  }
}
