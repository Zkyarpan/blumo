"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { submitSupportFormAction, type SupportFormState } from "./support-form.actions";

const CATEGORIES = [
  { value: "question", label: "General question" },
  { value: "bug_report", label: "Bug report" },
  { value: "feature_request", label: "Feature request" },
  { value: "account", label: "Account issue" },
  { value: "other", label: "Other" },
] as const;

export function SupportForm() {
  const [state, dispatch, isPending] = useActionState<SupportFormState, FormData>(
    submitSupportFormAction,
    null
  );

  if (state?.ok) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border p-4"
        style={{
          borderColor: "var(--state-success-soft)",
          backgroundColor: "var(--state-success-soft)",
        }}
      >
        <CheckCircle2
          className="size-5 shrink-0 mt-0.5"
          aria-hidden="true"
          style={{ color: "var(--state-success)" }}
        />
        <div>
          <p className="font-medium" style={{ color: "var(--state-success)" }}>
            Message sent
          </p>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            We received your message (ref:{" "}
            <span className="font-mono">#{state.data.ticketId}</span>). You should
            receive an acknowledgement email shortly.
          </p>
        </div>
      </div>
    );
  }

  const fieldErrors =
    state && !state.ok ? (state.error.fieldErrors ?? {}) : {};

  return (
    <form action={dispatch} className="space-y-4">
      {state && !state.ok && !state.error.fieldErrors && (
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

      {/* Category */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="support-category"
          className="text-xs font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Category
        </label>
        <select
          id="support-category"
          name="category"
          required
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
          }}
        >
          <option value="">Select a category…</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {fieldErrors.category && (
          <p className="text-xs" style={{ color: "var(--state-error)" }}>
            {fieldErrors.category[0]}
          </p>
        )}
      </div>

      {/* Subject */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="support-subject"
          className="text-xs font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Subject
        </label>
        <input
          id="support-subject"
          name="subject"
          type="text"
          required
          maxLength={200}
          placeholder="Brief description of your question or issue"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
          }}
        />
        {fieldErrors.subject && (
          <p className="text-xs" style={{ color: "var(--state-error)" }}>
            {fieldErrors.subject[0]}
          </p>
        )}
      </div>

      {/* Message */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="support-message"
          className="text-xs font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          Message
        </label>
        <textarea
          id="support-message"
          name="message"
          required
          rows={5}
          maxLength={2000}
          placeholder="Describe your question or issue in detail"
          className="rounded-lg border px-3 py-2 text-sm resize-y"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-primary)",
          }}
        />
        {fieldErrors.message && (
          <p className="text-xs" style={{ color: "var(--state-error)" }}>
            {fieldErrors.message[0]}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:cursor-not-allowed transition-colors"
        style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          "Send message"
        )}
      </button>
    </form>
  );
}
