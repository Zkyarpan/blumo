import "server-only";

import { serverEnv } from "@/lib/env/server";
import { sendEmail } from "./client";
import {
  commitSuccessTemplate,
  commitRecoverableFailureTemplate,
} from "./templates";
import type {
  EmailSendResult,
  CommitSuccessEmailData,
  CommitRecoverableFailureEmailData,
} from "./types";

function tasksFrom(): string {
  return serverEnv.RESEND_TASKS_FROM ?? `Blumo Tasks <tasks@mail.arpankarki.com.np>`;
}

export async function sendCommitSuccessEmail(
  data: CommitSuccessEmailData
): Promise<EmailSendResult> {
  const { html, text, subject } = commitSuccessTemplate({
    recipientName: data.recipientName,
    missionTitle: data.missionTitle,
    repositoryFullName: data.repositoryFullName,
    branch: data.branch,
    filePath: data.filePath,
    commitMessage: data.commitMessage,
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
    emailType: "github_commit_success",
    // Idempotency: one success email per task
    idempotencyKey: `commit-success-${data.taskId}`,
  });
}

export async function sendCommitRecoverableFailureEmail(
  data: CommitRecoverableFailureEmailData
): Promise<EmailSendResult> {
  const { html, text, subject } = commitRecoverableFailureTemplate({
    recipientName: data.recipientName,
    missionTitle: data.missionTitle,
    repositoryFullName: data.repositoryFullName,
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
    emailType: "github_commit_recoverable_failure",
    idempotencyKey: `commit-recovery-${data.taskId}`,
  });
}
