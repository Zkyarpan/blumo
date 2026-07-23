import "server-only";

import { serverEnv } from "@/lib/env/server";
import { sendEmail } from "./client";
import { welcomeTemplate } from "./templates";
import type { EmailSendResult, WelcomeEmailData } from "./types";

/**
 * Sends the welcome email after onboarding completes.
 * Must only be called after the onboarding transaction succeeds.
 * Email failure does not affect the onboarding result.
 */
export async function sendWelcomeEmail(
  data: WelcomeEmailData
): Promise<EmailSendResult> {
  const from =
    serverEnv.RESEND_AUTH_FROM ??
    `Blumo <no-reply@mail.arpankarki.com.np>`;

  const { html, text, subject } = welcomeTemplate({
    recipientName: data.recipientName,
    goal: data.goal,
    replyTo: serverEnv.RESEND_REPLY_TO,
  });

  return sendEmail({
    to: data.recipientEmail,
    from,
    replyTo: serverEnv.RESEND_REPLY_TO,
    subject,
    html,
    text,
    emailType: "welcome",
    // Idempotency key: one welcome per user
    idempotencyKey: `welcome-${data.recipientEmail}`,
  });
}
