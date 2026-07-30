import "server-only";

import { serverEnv } from "@/lib/env/server";
import { sendEmail } from "./client";
import { autoCommitSuccessTemplate } from "./templates";
import type { EmailSendResult, AutoCommitSuccessEmailData } from "./types";

function tasksFrom(): string {
  return serverEnv.RESEND_TASKS_FROM ?? `Blumo Tasks <tasks@mail.arpankarki.com.np>`;
}

export async function sendAutoCommitSuccessEmail(
  data: AutoCommitSuccessEmailData
): Promise<EmailSendResult> {
  const { html, text, subject } = autoCommitSuccessTemplate({
    recipientName: data.recipientName,
    missionTitle: data.missionTitle,
    repositoryFullName: data.repositoryFullName,
    branch: data.branch,
    filePath: data.filePath,
    commitUrl: data.commitUrl,
    commitSha: data.commitSha,
    taskId: data.taskId,
    replyTo: serverEnv.RESEND_REPLY_TO,
  });
  return sendEmail({
    to: data.recipientEmail,
    from: tasksFrom(),
    replyTo: serverEnv.RESEND_REPLY_TO,
    subject,
    html,
    text,
    emailType: "auto_commit_success",
    // One auto-commit success email per task
    idempotencyKey: `auto-commit-success-${data.taskId}`,
  });
}
