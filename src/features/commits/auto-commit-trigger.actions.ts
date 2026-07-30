"use server";

import { getUser } from "@/features/auth/get-user";
import { runAutoCommitForUser } from "@/features/settings/auto-commit.service";
import { getActiveSchedule } from "@/features/settings/schedule.service";
import type { ActionResult } from "@/types/action-result";

export type TriggerAutoCommitResult = ActionResult<{
  commitUrl: string;
  commitSha: string;
  missionTitle: string;
  repositoryFullName: string;
  branch: string;
}>;

/**
 * Triggers an immediate auto-commit for the current user.
 * Used from the Auto-commits page as a "Run now" button.
 * Reuses the same pipeline as the scheduled cron.
 */
export async function triggerAutoCommitNowAction(): Promise<TriggerAutoCommitResult> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: { code: "unauthorized", message: "Your session has expired." } };
  }

  const schedule = await getActiveSchedule(user.id);
  const result = await runAutoCommitForUser(user.id, schedule?.id ?? "manual");

  if (result.code === "committed") {
    return {
      ok: true,
      data: {
        commitUrl: result.commitUrl ?? "",
        commitSha: result.commitSha ?? "",
        missionTitle: result.missionTitle ?? "Daily mission",
        repositoryFullName: result.repositoryFullName ?? "",
        branch: result.branch ?? "",
      },
    };
  }

  const messages: Record<string, string> = {
    already_committed_today: "Already committed today ✓  — your next auto-commit runs tomorrow at the scheduled time.",
    no_active_goal: "Set a learning goal first (Settings → Learning preferences).",
    no_active_repository: "No active repository connected. Go to Settings → GitHub connection.",
    installation_suspended: "GitHub access is suspended. Restore the Blumo GitHub App from your GitHub settings.",
    generation_failed: "AI generation is temporarily busy. Wait a minute and try again, or let the schedule handle it automatically tonight.",
    approve_failed: "Could not auto-approve — try approving manually from the Tasks page.",
    commit_failed: "GitHub commit failed. Check your repository access in Settings and try again.",
    database_error: "The commit may have succeeded on GitHub but could not be saved. Check your repository before retrying.",
  };

  return {
    ok: false,
    error: {
      code: result.code,
      message: messages[result.code] ?? "Auto-commit failed. Please try again.",
    },
  };
}
