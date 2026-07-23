"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { sendTestEmailAction, type TestEmailState } from "./test-email.actions";

interface TestEmailButtonProps {
  resendConfigured: boolean;
  userEmail: string;
}

export function TestEmailButton({ resendConfigured, userEmail }: TestEmailButtonProps) {
  const [state, dispatch, isPending] = useActionState<TestEmailState, FormData>(
    sendTestEmailAction,
    null
  );

  if (!resendConfigured) {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-subtle)",
        }}
      >
        <AlertCircle
          className="size-4 shrink-0 mt-0.5"
          aria-hidden="true"
          style={{ color: "var(--state-warning)" }}
        />
        <p style={{ color: "var(--text-muted)" }}>
          Email delivery is not configured. Add{" "}
          <code className="font-mono">RESEND_API_KEY</code> to send a test email.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Send a test email to{" "}
        <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>
          {userEmail}
        </span>{" "}
        to verify Resend delivery.
      </p>

      <form action={dispatch}>
        <button
          type="submit"
          disabled={isPending || state?.ok === true}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium cursor-pointer disabled:cursor-not-allowed transition-colors hover:bg-[var(--bg-subtle)]"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-secondary)",
          }}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : (
            "Send test email"
          )}
        </button>
      </form>

      {state?.ok && (
        <div
          role="status"
          className="flex items-center gap-1.5 text-sm"
          style={{ color: "var(--state-success)" }}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Test email sent. Check your inbox.
        </div>
      )}

      {state && !state.ok && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--state-error-soft)",
            backgroundColor: "var(--state-error-soft)",
          }}
        >
          <AlertCircle
            className="size-4 shrink-0 mt-0.5"
            aria-hidden="true"
            style={{ color: "var(--state-error)" }}
          />
          <p style={{ color: "var(--state-error)" }}>{state.error.message}</p>
        </div>
      )}
    </div>
  );
}
