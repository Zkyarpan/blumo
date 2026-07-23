"use server";

import { z } from "zod";
import { getUser } from "@/features/auth/get-user";
import { saveEmailPreferences } from "./email-preferences.service";
import type { ActionResult } from "@/types/action-result";

const prefsSchema = z.object({
  email_mission_generated: z.coerce.boolean(),
  email_mission_approved: z.coerce.boolean(),
  email_mission_rejected: z.coerce.boolean(),
  email_commit_success: z.coerce.boolean(),
  email_github_connection: z.coerce.boolean(),
  email_weekly_progress: z.coerce.boolean(),
});

export type SavePrefsState = ActionResult<{ saved: true }> | null;

export async function saveEmailPreferencesAction(
  _prev: SavePrefsState,
  formData: FormData
): Promise<SavePrefsState> {
  const user = await getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "unauthorized", message: "Please sign in again." },
    };
  }

  // Boolean checkboxes: only present in FormData when checked.
  // So we coerce absent values to false.
  const raw = {
    email_mission_generated: formData.get("email_mission_generated") === "on",
    email_mission_approved: formData.get("email_mission_approved") === "on",
    email_mission_rejected: formData.get("email_mission_rejected") === "on",
    email_commit_success: formData.get("email_commit_success") === "on",
    email_github_connection: formData.get("email_github_connection") === "on",
    email_weekly_progress: formData.get("email_weekly_progress") === "on",
  };

  const parsed = prefsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "invalid_request", message: "Invalid preferences." },
    };
  }

  const result = await saveEmailPreferences(user.id, {
    emailMissionGenerated: parsed.data.email_mission_generated,
    emailMissionApproved: parsed.data.email_mission_approved,
    emailMissionRejected: parsed.data.email_mission_rejected,
    emailCommitSuccess: parsed.data.email_commit_success,
    emailGithubConnection: parsed.data.email_github_connection,
    emailWeeklyProgress: parsed.data.email_weekly_progress,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: { code: "database_error", message: result.message },
    };
  }

  return { ok: true, data: { saved: true } };
}
