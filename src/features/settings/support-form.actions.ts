"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getUser } from "@/features/auth/get-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv, isResendConfigured } from "@/lib/env/server";
import { sendEmail } from "@/lib/email/client";
import {
  supportAcknowledgementTemplate,
} from "@/lib/email/templates";
import type { ActionResult } from "@/types/action-result";

const CATEGORY_VALUES = [
  "question",
  "bug_report",
  "feature_request",
  "account",
  "other",
] as const;

const supportFormSchema = z.object({
  category: z.enum(CATEGORY_VALUES),
  subject: z
    .string()
    .min(5, "Subject must be at least 5 characters.")
    .max(200, "Subject must be under 200 characters.")
    .trim(),
  message: z
    .string()
    .min(20, "Message must be at least 20 characters.")
    .max(2000, "Message must be under 2000 characters.")
    .trim(),
});

// In-process rate limit: one submission per user per 10 minutes
const lastSubmission = new Map<string, number>();
const RATE_LIMIT_MS = 10 * 60 * 1000;

export type SupportFormState = ActionResult<{ ticketId: string }> | null;

export async function submitSupportFormAction(
  _prev: SupportFormState,
  formData: FormData
): Promise<SupportFormState> {
  const user = await getUser();
  if (!user?.email) {
    return {
      ok: false,
      error: { code: "unauthorized", message: "Please sign in again." },
    };
  }

  // Rate limit
  const lastTime = lastSubmission.get(user.id) ?? 0;
  if (Date.now() - lastTime < RATE_LIMIT_MS) {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Please wait before submitting another support request.",
      },
    };
  }

  const raw = {
    category: formData.get("category"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  };

  const parsed = supportFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: "Please fix the errors below.",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    };
  }

  const ticketId = randomUUID().slice(0, 8).toUpperCase();

  // Store support request in audit_logs (safe — derives identity from session)
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "support_request_submitted",
      resource_type: "support",
      resource_id: null,
      metadata: {
        ticket_id: ticketId,
        category: parsed.data.category,
        // Only store first 200 chars of subject for audit; never store full message
        subject_preview: parsed.data.subject.slice(0, 200),
      },
    });
  } catch {
    // Best-effort — don't block acknowledgement if audit log fails
  }

  lastSubmission.set(user.id, Date.now());

  // Send acknowledgement to the user
  if (isResendConfigured()) {
    const from =
      serverEnv.RESEND_SUPPORT_FROM ??
      serverEnv.RESEND_AUTH_FROM ??
      `Blumo Support <support@mail.arpankarki.com.np>`;

    const { html, text, subject } = supportAcknowledgementTemplate({
      recipientName: user.user_metadata?.full_name ?? user.email,
      subject: parsed.data.subject,
      ticketId,
      replyTo: serverEnv.RESEND_REPLY_TO,
    });

    await sendEmail({
      to: user.email,
      from,
      replyTo: serverEnv.RESEND_REPLY_TO,
      subject,
      html,
      text,
      emailType: "support_acknowledgement",
      idempotencyKey: `support-ack-${ticketId}`,
    });

    // Forward to support reply-to if configured (only RESEND_REPLY_TO, never an assumed inbox)
    if (serverEnv.RESEND_REPLY_TO) {
      // We do NOT send to support@mail.arpankarki.com.np unless inbound email is configured.
      // We forward the summary to RESEND_REPLY_TO (the founder's gmail).
      await sendEmail({
        to: serverEnv.RESEND_REPLY_TO,
        from,
        replyTo: user.email, // Reply goes to the user
        subject: `[Support] ${parsed.data.subject} — #${ticketId}`,
        html: `<p><strong>From:</strong> ${user.email}</p><p><strong>Category:</strong> ${parsed.data.category}</p><p><strong>Subject:</strong> ${parsed.data.subject}</p><p><strong>Message:</strong><br>${parsed.data.message.replace(/\n/g, "<br>")}</p>`,
        text: `From: ${user.email}\nCategory: ${parsed.data.category}\nSubject: ${parsed.data.subject}\n\n${parsed.data.message}`,
        emailType: "support_acknowledgement",
        idempotencyKey: `support-notify-${ticketId}`,
      });
    }
  }

  return { ok: true, data: { ticketId } };
}
