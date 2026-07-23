import "server-only";

import { serverEnv } from "@/lib/env/server";
import { sendEmail } from "./client";
import {
  installationSuspendedTemplate,
  installationUninstalledTemplate,
  repositoryAccessRemovedTemplate,
} from "./templates";
import type {
  EmailSendResult,
  InstallationSuspendedEmailData,
  InstallationUninstalledEmailData,
  RepositoryAccessRemovedEmailData,
} from "./types";

function authFrom(): string {
  return serverEnv.RESEND_AUTH_FROM ?? `Blumo <no-reply@mail.arpankarki.com.np>`;
}

export async function sendInstallationSuspendedEmail(
  data: InstallationSuspendedEmailData,
  idempotencyKey: string
): Promise<EmailSendResult> {
  const { html, text, subject } = installationSuspendedTemplate({
    recipientName: data.recipientName,
    accountLogin: data.accountLogin,
    replyTo: serverEnv.RESEND_REPLY_TO,
  });
  return sendEmail({
    to: data.recipientEmail,
    from: authFrom(),
    replyTo: serverEnv.RESEND_REPLY_TO,
    subject,
    html,
    text,
    emailType: "github_installation_suspended",
    // Idempotency key must be derived from the webhook delivery ID
    idempotencyKey,
  });
}

export async function sendInstallationUninstalledEmail(
  data: InstallationUninstalledEmailData,
  idempotencyKey: string
): Promise<EmailSendResult> {
  const { html, text, subject } = installationUninstalledTemplate({
    recipientName: data.recipientName,
    accountLogin: data.accountLogin,
    replyTo: serverEnv.RESEND_REPLY_TO,
  });
  return sendEmail({
    to: data.recipientEmail,
    from: authFrom(),
    replyTo: serverEnv.RESEND_REPLY_TO,
    subject,
    html,
    text,
    emailType: "github_installation_uninstalled",
    idempotencyKey,
  });
}

export async function sendRepositoryAccessRemovedEmail(
  data: RepositoryAccessRemovedEmailData,
  idempotencyKey: string
): Promise<EmailSendResult> {
  const { html, text, subject } = repositoryAccessRemovedTemplate({
    recipientName: data.recipientName,
    repositoryFullName: data.repositoryFullName,
    replyTo: serverEnv.RESEND_REPLY_TO,
  });
  return sendEmail({
    to: data.recipientEmail,
    from: authFrom(),
    replyTo: serverEnv.RESEND_REPLY_TO,
    subject,
    html,
    text,
    emailType: "repository_access_removed",
    idempotencyKey,
  });
}
