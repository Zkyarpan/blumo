"use server";

import { getUser } from "@/features/auth/get-user";
import { sendEmail } from "@/lib/email/client";
import { testEmailTemplate } from "@/lib/email/templates";
import { serverEnv, isResendConfigured } from "@/lib/env/server";
import type { ActionResult } from "@/types/action-result";

export type TestEmailState = ActionResult<{ messageId: string }> | null;

// Simple in-memory rate limit: one send per user per process restart
// (sufficient for dev). In production this action is disabled.
const recentSends = new Set<string>();

export async function sendTestEmailAction(
  prevState: TestEmailState,
  formData: FormData
): Promise<TestEmailState> {
  void prevState;
  void formData;
  // Only available outside production
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_TEST_EMAIL !== "true"
  ) {
    return {
      ok: false,
      error: {
        code: "unauthorized",
        message: "Test email is not available in production.",
      },
    };
  }

  const user = await getUser();
  if (!user?.email) {
    return {
      ok: false,
      error: {
        code: "unauthorized",
        message: "Please sign in again before sending a test email.",
      },
    };
  }

  if (!isResendConfigured()) {
    return {
      ok: false,
      error: {
        code: "configuration_error",
        message: "Email delivery is not configured yet. Add RESEND_API_KEY to .env.local.",
      },
    };
  }

  // Rate limit: one test email per user id per server process lifetime
  if (recentSends.has(user.id)) {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: "A test email was already sent recently. Restart the server to reset.",
      },
    };
  }

  const from =
    serverEnv.RESEND_AUTH_FROM ??
    `Blumo <no-reply@mail.arpankarki.com.np>`;

  const { html, text, subject } = testEmailTemplate({
    recipientName: user.user_metadata?.full_name ?? user.email,
    replyTo: serverEnv.RESEND_REPLY_TO,
  });

  const result = await sendEmail({
    to: user.email,
    from,
    replyTo: serverEnv.RESEND_REPLY_TO,
    subject,
    html,
    text,
    emailType: "test_email",
    idempotencyKey: `test-${user.id}-${Date.now()}`,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: result.code,
        message: result.message,
      },
    };
  }

  recentSends.add(user.id);

  return { ok: true, data: { messageId: result.messageId } };
}
