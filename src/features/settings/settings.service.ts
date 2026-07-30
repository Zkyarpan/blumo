import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEmailPreferences, DEFAULT_EMAIL_PREFERENCES, type EmailPreferences } from "./email-preferences.service";
import { getActiveSchedule, type AutoCommitSchedule } from "./schedule.service";
import { getResendConfigState } from "@/lib/env/server";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface SettingsData {
  profile: {
    id: string;
    displayName: string | null;
    githubUsername: string | null;
    avatarUrl: string | null;
    timezone: string | null;
    experienceLevel: string | null;
  };
  goal: {
    id: string;
    title: string;
    technology: string;
    taskType: string;
    dailyMinutes: number;
  } | null;
  github: {
    installationStatus: "active" | "suspended" | "uninstalled" | null;
    selectedRepository: {
      fullName: string;
      defaultBranch: string;
    } | null;
  };
  emailPreferences: EmailPreferences;
  autoCommitSchedule: AutoCommitSchedule | null;
  resend: {
    configured: boolean;
    hasApiKey: boolean;
  };
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

export async function getSettingsData(
  userId: string
): Promise<SettingsData | null> {
  try {
    const supabase = await createSupabaseServerClient();

    // Profile
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, display_name, github_username, avatar_url, timezone, experience_level"
      )
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profileRow) {
      return null;
    }

    // Active goal
    let goal: SettingsData["goal"] = null;
    const { data: goalRow } = await supabase
      .from("goals")
      .select("id, title, technology, task_type, daily_minutes")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (goalRow) {
      goal = {
        id: goalRow.id,
        title: goalRow.title,
        technology: goalRow.technology,
        taskType: goalRow.task_type,
        dailyMinutes: goalRow.daily_minutes,
      };
    }

    // GitHub installation
    let installationStatus: SettingsData["github"]["installationStatus"] = null;
    let activeInstallationId: string | null = null;

    const { data: installRow } = await supabase
      .from("github_installations")
      .select("id, status")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (installRow) {
      const s = installRow.status as string;
      if (s === "active" || s === "suspended" || s === "uninstalled") {
        installationStatus = s;
        if (s === "active") activeInstallationId = installRow.id;
      }
    }

    // Selected repository
    let selectedRepository: SettingsData["github"]["selectedRepository"] = null;
    if (activeInstallationId) {
      const { data: repoRow } = await supabase
        .from("repositories")
        .select("full_name, default_branch")
        .eq("user_id", userId)
        .eq("installation_id", activeInstallationId)
        .eq("is_selected", true)
        .eq("access_status", "active")
        .limit(1)
        .maybeSingle();

      if (repoRow) {
        selectedRepository = {
          fullName: repoRow.full_name,
          defaultBranch: repoRow.default_branch,
        };
      }
    }

    // Email preferences and schedule
    const [emailPrefs, autoCommitSchedule] = await Promise.all([
      getEmailPreferences(userId),
      getActiveSchedule(userId),
    ]);
    const resendState = getResendConfigState();

    return {
      profile: {
        id: profileRow.id,
        displayName: profileRow.display_name,
        githubUsername: profileRow.github_username,
        avatarUrl: profileRow.avatar_url,
        timezone: profileRow.timezone,
        experienceLevel: profileRow.experience_level,
      },
      goal,
      github: {
        installationStatus,
        selectedRepository,
      },
      emailPreferences: emailPrefs ?? { ...DEFAULT_EMAIL_PREFERENCES },
      autoCommitSchedule,
      resend: {
        configured: resendState.configured,
        hasApiKey: resendState.hasApiKey,
      },
    };
  } catch {
    return null;
  }
}
