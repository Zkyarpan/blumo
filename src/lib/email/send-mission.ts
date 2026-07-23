import "server-only";

import { serverEnv } from "@/lib/env/server";
import { sendEmail } from "./client";
import {
  missionGeneratedTemplate,
  missionApprovedTemplate,
  missionRejectedTemplate,
  missionRegeneratedTemplate,
} from "./templates";
import type {
  EmailSendResult,
  MissionGeneratedEmailData,
  MissionApprovedEmailData,
  MissionRejectedEmailData,
  MissionRegeneratedEmailData,
} from "./types";

function tasksFrom(): string {
  return serverEnv.RESEND_TASKS_FROM ?? `Blumo Tasks <tasks@mail.arpankarki.com.np>`;
}

export async function sendMissionGeneratedEmail(
  data: MissionGeneratedEmailData
): Promise<EmailSendResult> {
  const { html, text, subject } = missionGeneratedTemplate({
    recipientName: data.recipientName,
    missionTitle: data.missionTitle,
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
    emailType: "mission_generated",
    idempotencyKey: `mission-generated-${data.taskId}`,
  });
}

export async function sendMissionApprovedEmail(
  data: MissionApprovedEmailData
): Promise<EmailSendResult> {
  const { html, text, subject } = missionApprovedTemplate({
    recipientName: data.recipientName,
    missionTitle: data.missionTitle,
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
    emailType: "mission_approved",
    idempotencyKey: `mission-approved-${data.taskId}`,
  });
}

export async function sendMissionRejectedEmail(
  data: MissionRejectedEmailData
): Promise<EmailSendResult> {
  const { html, text, subject } = missionRejectedTemplate({
    recipientName: data.recipientName,
    missionTitle: data.missionTitle,
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
    emailType: "mission_rejected",
    idempotencyKey: `mission-rejected-${data.taskId}`,
  });
}

export async function sendMissionRegeneratedEmail(
  data: MissionRegeneratedEmailData
): Promise<EmailSendResult> {
  const { html, text, subject } = missionRegeneratedTemplate({
    recipientName: data.recipientName,
    missionTitle: data.missionTitle,
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
    emailType: "mission_regenerated",
    idempotencyKey: `mission-regenerated-${data.taskId}`,
  });
}
