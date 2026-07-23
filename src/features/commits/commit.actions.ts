"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/features/auth/get-user";
import { executeCommit } from "./commit-proposal.service";
import type { CommitResultCode } from "./commit.types";
import type { ActionResult } from "@/types/action-result";
import { sendCommitSuccessEmail, sendCommitRecoverableFailureEmail } from "@/lib/email/send-commit";
import { getEmailPreferences } from "@/features/settings/email-preferences.service";

// --------------------------------------------------------------------------
// Input schema — accepts only taskId and operationId from the client.
// user_id is always derived from the server session.
// --------------------------------------------------------------------------

const NEXT_ACTION_FIELDS = /^\$ACTION_/;

const commitActionSchema = z
  .object({
    taskId: z.string().uuid(),
    operationId: z.string().uuid(),
  })
  .strict();

function extractNonFrameworkFields(
  formData: FormData
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!NEXT_ACTION_FIELDS.test(key)) {
      result[key] = typeof value === "string" ? value : "";
    }
  }
  return result;
}

// --------------------------------------------------------------------------
// User-facing error messages (safe — no secrets, no stack traces)
// --------------------------------------------------------------------------

const ERROR_MESSAGES: Record<CommitResultCode, string> = {
  committed: "Commit created.",
  already_committed: "This mission has already been committed.",
  not_found: "Mission not found. Please return to the dashboard.",
  invalid_transition:
    "This mission is not in an approved state and cannot be committed. Please review the mission first.",
  repository_unavailable:
    "Your selected repository is no longer accessible. Restore repository access and try again.",
  installation_suspended:
    "GitHub access is suspended. Restore the Blumo GitHub App installation to continue.",
  invalid_branch:
    "The proposed branch name could not be used. Refresh the page and try again.",
  invalid_path:
    "The proposed file path could not be used. Refresh the page and try again.",
  content_too_large:
    "The mission content is too large to commit. Contact support.",
  branch_conflict:
    "The proposed branch already exists in this repository. Generate a new mission to get a fresh branch name.",
  file_conflict:
    "A file already exists at the proposed path in this repository. Contact support.",
  permission_changed:
    "Blumo no longer has permission to write to this repository. Manage your GitHub App access and reconnect.",
  github_unavailable:
    "GitHub is temporarily unavailable. Wait a moment and try again.",
  unauthorized: "Your session has expired. Please sign in again.",
  invalid_request: "Invalid request. Please refresh and try again.",
  database_error:
    "The commit may have succeeded on GitHub, but Blumo could not save the result. Do not retry automatically — check your GitHub repository first, then contact support.",
};

// --------------------------------------------------------------------------
// Action result type
// --------------------------------------------------------------------------

export type CommitActionState = ActionResult<{
  code: CommitResultCode;
  commitUrl?: string;
  commitSha?: string;
  branch?: string;
  filePath?: string;
  repositoryFullName?: string;
  missionTitle?: string;
}> | null;

export async function confirmCommitAction(
  _prev: CommitActionState,
  formData: FormData
): Promise<CommitActionState> {
  const user = await getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "unauthorized", message: ERROR_MESSAGES.unauthorized },
    };
  }

  const fields = extractNonFrameworkFields(formData);
  const parsed = commitActionSchema.safeParse(fields);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: ERROR_MESSAGES.invalid_request,
      },
    };
  }

  const { taskId } = parsed.data;

  const result = await executeCommit(user.id, taskId);

  if (result.code === "committed" || result.code === "already_committed") {
    revalidatePath(`/tasks/${taskId}/commit`);
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath("/history");

    // Fire-and-forget commit success email (only for new commits, not already_committed)
    if (result.code === "committed" && user.email && "commitUrl" in result) {
      const prefs = await getEmailPreferences(user.id).catch(() => null);
      if (prefs?.emailCommitSuccess !== false) {
        sendCommitSuccessEmail({
          recipientEmail: user.email,
          recipientName:
            (user.user_metadata?.full_name as string | undefined) ??
            (user.user_metadata?.user_name as string | undefined) ??
            user.email,
          missionTitle: "", // will be replaced by task title from proposal
          repositoryFullName: result.repositoryFullName ?? "",
          branch: result.branch ?? "",
          filePath: result.filePath ?? "",
          commitMessage: "",
          commitUrl: result.commitUrl ?? "",
          commitSha: result.commitSha ?? "",
          taskId,
        }).catch(() => {
          // Email failure never changes commit status
        });
      }
    }

    const successData: CommitActionState = {
      ok: true,
      data: {
        code: result.code,
        ...(result.code === "committed" &&
        "commitUrl" in result
          ? {
              commitUrl: result.commitUrl,
              commitSha: result.commitSha,
              branch: result.branch,
              filePath: result.filePath,
              repositoryFullName: result.repositoryFullName,
            }
          : {}),
      },
    };
    return successData;
  }

  // Fire-and-forget recoverable failure email (database_error only)
  if (result.code === "database_error" && user.email) {
    sendCommitRecoverableFailureEmail({
      recipientEmail: user.email,
      recipientName:
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.user_name as string | undefined) ??
        user.email,
      missionTitle: "",
      repositoryFullName: "",
      taskId,
    }).catch(() => {});
  }

  return {
    ok: false,
    error: {
      code: result.code,
      message: ERROR_MESSAGES[result.code] ?? "An unexpected error occurred. Please refresh and try again.",
    },
  };
}
