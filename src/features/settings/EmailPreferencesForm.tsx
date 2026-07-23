"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { EmailPreferences } from "./email-preferences.service";
import { saveEmailPreferencesAction, type SavePrefsState } from "./email-preferences.actions";

interface PreferenceToggleProps {
  name: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  mandatory?: boolean;
}

function PreferenceToggle({
  name,
  label,
  description,
  checked,
  disabled,
  mandatory,
}: PreferenceToggleProps) {
  return (
    <label className="flex items-start gap-3 py-3 cursor-pointer">
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          name={name}
          defaultChecked={checked}
          disabled={disabled || mandatory}
          value="on"
          className="sr-only peer"
        />
        <div
          className="w-9 h-5 rounded-full border-2 transition-colors peer-checked:border-[var(--accent-primary)] peer-checked:bg-[var(--accent-primary)] peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--focus-ring)] peer-focus-visible:ring-offset-1"
          style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--bg-subtle)" }}
          aria-hidden="true"
        />
        <div
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"
          aria-hidden="true"
        />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {label}
          </span>
          {mandatory && (
            <span
              className="text-xs rounded px-1.5 py-0.5"
              style={{ backgroundColor: "var(--bg-subtle)", color: "var(--text-muted)" }}
            >
              Always on
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>
    </label>
  );
}

interface EmailPreferencesFormProps {
  preferences: EmailPreferences;
  resendConfigured: boolean;
}

export function EmailPreferencesForm({
  preferences,
  resendConfigured,
}: EmailPreferencesFormProps) {
  const [state, dispatch, isPending] = useActionState<SavePrefsState, FormData>(
    saveEmailPreferencesAction,
    null
  );

  return (
    <div className="space-y-4">
      {!resendConfigured && (
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
          <div>
            <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
              Email delivery not configured
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Add <code className="font-mono">RESEND_API_KEY</code> to your environment to enable
              product email notifications. Supabase Auth emails (sign-in, security) are
              delivered independently.
            </p>
          </div>
        </div>
      )}

      <form action={dispatch} className="space-y-1">
        <div
          className="divide-y rounded-xl border"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <div className="px-4">
            <PreferenceToggle
              name="email_mission_generated"
              label="Mission generated"
              description="Receive an email when your daily mission is ready to review."
              checked={preferences.emailMissionGenerated}
            />
          </div>
          <div className="px-4">
            <PreferenceToggle
              name="email_mission_approved"
              label="Mission approved"
              description="Receive a reminder when you approve a mission and it's ready to commit."
              checked={preferences.emailMissionApproved}
            />
          </div>
          <div className="px-4">
            <PreferenceToggle
              name="email_mission_rejected"
              label="Mission rejected"
              description="Receive an email when you reject a mission."
              checked={preferences.emailMissionRejected}
            />
          </div>
          <div className="px-4">
            <PreferenceToggle
              name="email_commit_success"
              label="Commit created"
              description="Receive a confirmation when a GitHub commit is successfully created."
              checked={preferences.emailCommitSuccess}
            />
          </div>
          <div className="px-4">
            <PreferenceToggle
              name="email_github_connection"
              label="GitHub connection changes"
              description="Receive an email when your GitHub App is suspended, uninstalled, or repository access changes. These are account-security notifications."
              checked={preferences.emailGithubConnection}
              mandatory
            />
          </div>
          <div className="px-4">
            <PreferenceToggle
              name="email_weekly_progress"
              label="Weekly progress report"
              description="Receive a summary of your completed missions each week. Requires scheduling (Phase 2)."
              checked={preferences.emailWeeklyProgress}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: "var(--accent-primary)", color: "#fff" }}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save preferences"
            )}
          </button>

          {state?.ok && (
            <div
              role="status"
              className="flex items-center gap-1.5 text-sm"
              style={{ color: "var(--state-success)" }}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Saved
            </div>
          )}
          {state && !state.ok && (
            <p role="alert" className="text-sm" style={{ color: "var(--state-error)" }}>
              {state.error.message}
            </p>
          )}
        </div>
      </form>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Supabase Auth emails (sign-in confirmation, password reset) are delivered
        independently and cannot be disabled here.
      </p>
    </div>
  );
}
