import "server-only";

import { Resend } from "resend";
import { randomUUID } from "node:crypto";
import { serverEnv, isResendConfigured } from "@/lib/env/server";
import type {
  EmailEventType,
  EmailSendResult,
  EmailErrorCode,
  EmailDiagnostics,
} from "./types";
import { EMAIL_ERROR_MESSAGES as MSG } from "./types";

// --------------------------------------------------------------------------
// Singleton Resend client — created lazily; never re-exported with the key
// --------------------------------------------------------------------------

let _resend: Resend | null = null;

/**
 * Returns the singleton Resend client, or null if not configured.
 * Supports dependency injection in tests via the optional `_injected` param.
 */
export function getResendClient(_injected?: Resend): Resend | null {
  if (_injected) return _injected;
  if (_resend) return _resend;
  if (!isResendConfigured()) return null;
  _resend = new Resend(serverEnv.RESEND_API_KEY!);
  return _resend;
}

// --------------------------------------------------------------------------
// Normalized send helper
// --------------------------------------------------------------------------

interface SendEmailOptions {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  emailType: EmailEventType;
  idempotencyKey: string;
  /** Injected Resend client — used in tests only. */
  _client?: Resend;
}

/**
 * Sends a single email through Resend.
 * Returns a normalized result — never throws or exposes the API key.
 * Logs safe diagnostics only.
 */
export async function sendEmail(
  opts: SendEmailOptions
): Promise<EmailSendResult> {
  const operationId = randomUUID();

  const client = getResendClient(opts._client);
  if (!client) {
    const diag: EmailDiagnostics = {
      emailType: opts.emailType,
      provider: "resend",
      retryable: false,
      recipientCount: 1,
      operationId,
    };
    logSafeDiagnostics("email_not_configured", diag);
    return {
      ok: false,
      code: "configuration_error",
      message: MSG.configuration_error,
      retryable: false,
    };
  }

  try {
    const result = await client.emails.send({
      from: opts.from,
      to: [opts.to],
      replyTo: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      headers: {
        // Idempotency key header — prevents duplicate sends for the same key
        "X-Entity-Ref-ID": opts.idempotencyKey,
      },
    });

    if (result.error) {
      // Normalize statusCode: Resend SDK may return number | null
      const normalizedError = {
        name: result.error.name,
        statusCode: result.error.statusCode ?? undefined,
        message: result.error.message,
      };
      const code = mapResendError(normalizedError, opts.emailType, operationId);
      return {
        ok: false,
        code,
        message: MSG[code],
        retryable: isRetryable(code),
      };
    }

    if (!result.data?.id) {
      const diag: EmailDiagnostics = {
        emailType: opts.emailType,
        provider: "resend",
        retryable: false,
        recipientCount: 1,
        operationId,
      };
      logSafeDiagnostics("email_no_message_id", diag);
      return {
        ok: false,
        code: "unknown_error",
        message: MSG.unknown_error,
        retryable: false,
      };
    }

    return {
      ok: true,
      messageId: result.data.id,
      emailType: opts.emailType,
    };
  } catch (err: unknown) {
    const code = mapResendException(err, opts.emailType, operationId);
    return {
      ok: false,
      code,
      message: MSG[code],
      retryable: isRetryable(code),
    };
  }
}

// --------------------------------------------------------------------------
// Error mapping — never exposes API key, full body, or authentication tokens
// --------------------------------------------------------------------------

function mapResendError(
  error: { name?: string; statusCode?: number; message?: string },
  emailType: EmailEventType,
  operationId: string
): EmailErrorCode {
  const status = error.statusCode ?? 0;
  const name = (error.name ?? "").toLowerCase();

  const diag: EmailDiagnostics = {
    emailType,
    provider: "resend",
    providerStatus: status,
    providerErrorName: error.name,
    retryable: false,
    recipientCount: 1,
    operationId,
  };

  let code: EmailErrorCode;

  if (status === 401 || status === 403) {
    code = "unauthorized";
  } else if (status === 422 && name.includes("domain")) {
    code = "domain_not_verified";
  } else if (status === 422) {
    code = "invalid_recipient";
  } else if (status === 429) {
    code = "rate_limited";
  } else if (status >= 500) {
    code = "provider_unavailable";
  } else {
    code = "provider_error";
  }

  diag.retryable = isRetryable(code);
  logSafeDiagnostics("email_send_error", diag);
  return code;
}

function mapResendException(
  err: unknown,
  emailType: EmailEventType,
  operationId: string
): EmailErrorCode {
  const diag: EmailDiagnostics = {
    emailType,
    provider: "resend",
    retryable: true,
    recipientCount: 1,
    operationId,
  };

  if (typeof err === "object" && err !== null) {
    const e = err as { status?: number; name?: string; message?: string };
    diag.providerStatus = e.status;
    diag.providerErrorName = e.name;

    if (e.status === 429) {
      diag.retryable = true;
      logSafeDiagnostics("email_rate_limited", diag);
      return "rate_limited";
    }
    if (e.status && e.status >= 500) {
      diag.retryable = true;
      logSafeDiagnostics("email_provider_unavailable", diag);
      return "provider_unavailable";
    }
  }

  logSafeDiagnostics("email_unknown_exception", diag);
  return "unknown_error";
}

function isRetryable(code: EmailErrorCode): boolean {
  return code === "rate_limited" || code === "provider_unavailable" || code === "unknown_error";
}

// --------------------------------------------------------------------------
// Safe diagnostics logger — never logs API key, token, body, or recipient list
// --------------------------------------------------------------------------

function logSafeDiagnostics(event: string, diag: EmailDiagnostics): void {
  // Only log in non-production or when an error occurred
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[email:${event}]`, {
    emailType: diag.emailType,
    provider: diag.provider,
    providerStatus: diag.providerStatus,
    providerErrorName: diag.providerErrorName,
    providerErrorCode: diag.providerErrorCode,
    retryable: diag.retryable,
    recipientCount: diag.recipientCount,
    operationId: diag.operationId,
    // NOTE: never log API key, full email body, confirmation URL, or recipient email
  });
}
