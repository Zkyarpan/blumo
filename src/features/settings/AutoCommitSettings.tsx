"use client";

import { useActionState, useRef, useState } from "react";
import { Zap, Clock, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";
import { saveAutoCommitScheduleAction, disableAutoCommitAction } from "./schedule.actions";
import type { AutoCommitSchedule } from "./schedule.service";
import type { ScheduleActionResult } from "./schedule.actions";

// --------------------------------------------------------------------------
// Time options — every 30 minutes
// --------------------------------------------------------------------------

const TIME_OPTIONS: { label: string; value: string }[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const hh = h.toString().padStart(2, "0");
    const mm = m.toString().padStart(2, "0");
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    TIME_OPTIONS.push({
      label: `${h12}:${mm} ${ampm}`,
      value: `${hh}:${mm}`,
    });
  }
}

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

interface AutoCommitSettingsProps {
  schedule: AutoCommitSchedule | null;
  userTimezone: string;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function AutoCommitSettings({
  schedule,
  userTimezone,
}: AutoCommitSettingsProps) {
  const [selectedTime, setSelectedTime] = useState(schedule?.localTime ?? "09:00");
  // Warn only when timezone is literally UTC (not a real city/region), which
  // means the user likely did not set their timezone during onboarding.
  const isUtc = userTimezone === "UTC" || userTimezone === "Etc/UTC" || userTimezone === "Etc/GMT";

  const [saveState, saveAction, savePending] = useActionState<ScheduleActionResult | null, FormData>(
    saveAutoCommitScheduleAction,
    null
  );
  const [disableState, disableAction, disablePending] = useActionState<ScheduleActionResult | null, FormData>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_previousState, _fd) => disableAutoCommitAction(),
    null
  );

  const saveFormRef = useRef<HTMLFormElement>(null);
  const disableFormRef = useRef<HTMLFormElement>(null);

  // Derive enabled state from server action outcomes, falling back to DB-loaded value
  const isEnabled =
    disableState?.ok ? false :
    saveState?.ok ? true :
    !!schedule?.isActive;

  const isPending = savePending || disablePending;
  const errorMessage =
    (!saveState?.ok && saveState?.error?.message) ||
    (!disableState?.ok && disableState?.error?.message) ||
    null;

  const nextRunFormatted = schedule?.nextRunAt
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: userTimezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(schedule.nextRunAt))
    : null;

  const lastRunFormatted = schedule?.lastRunAt
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: userTimezone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(schedule.lastRunAt))
    : null;

  return (
    <div className="space-y-4">
      {/* Enable / disable toggle row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Auto-commit daily missions
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Blumo generates and commits a mission on your behalf every day at your chosen time.
          </p>
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          disabled={isPending}
          onClick={() => {
            if (isEnabled) {
              disableFormRef.current?.requestSubmit();
            } else {
              saveFormRef.current?.requestSubmit();
            }
          }}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: isEnabled ? "var(--accent-primary)" : "var(--border-default)",
          }}
        >
          <span
            className="pointer-events-none inline-block size-5 rounded-full shadow transition-transform"
            style={{
              backgroundColor: "#fff",
              transform: isEnabled ? "translateX(20px)" : "translateX(0)",
            }}
          />
          <span className="sr-only">{isEnabled ? "Disable auto-commit" : "Enable auto-commit"}</span>
        </button>
      </div>

      {/* Time picker */}
      <form ref={saveFormRef} action={saveAction} className="space-y-3">
        <input type="hidden" name="timezone" value={userTimezone} />
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="auto-commit-time"
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Daily commit time
            </label>
            <select
              id="auto-commit-time"
              name="localTime"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              disabled={isPending}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              {TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer hover:bg-[var(--bg-subtle)]"
            style={{
              borderColor: "var(--border-default)",
              color: "var(--text-secondary)",
            }}
          >
            {savePending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Clock className="size-3.5" aria-hidden="true" />
            )}
            {isEnabled ? "Update time" : "Enable at this time"}
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Timezone: <span className="font-mono">{userTimezone}</span>
        </p>
        {isUtc && (
          <div className="flex items-start gap-1.5 text-xs rounded-lg border p-2.5" style={{ borderColor: "var(--state-warning)", color: "var(--state-warning)", backgroundColor: "var(--bg-surface)" }}>
            <Info className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Your timezone is set to UTC, not a local timezone. If you are in the UK,{" "}
              go to{" "}
              <a href="/onboarding" className="underline underline-offset-2">Onboarding</a>{" "}
              and select <strong>Europe/London — United Kingdom</strong> so commits happen
              at the correct local time and automatically adjust for GMT/BST.
            </span>
          </div>
        )}
      </form>

      {/* Hidden disable form */}
      <form ref={disableFormRef} action={disableAction} className="hidden">
        <button type="submit" />
      </form>

      {/* Status badges when enabled */}
      {isEnabled && (
        <div className="space-y-1.5">
          {nextRunFormatted && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              <Zap className="size-3.5 shrink-0" aria-hidden="true" style={{ color: "var(--accent-primary)" }} />
              Next commit: <span className="font-medium ml-0.5" style={{ color: "var(--text-secondary)" }}>{nextRunFormatted}</span>
            </div>
          )}
          {lastRunFormatted && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" style={{ color: "var(--state-success)" }} />
              Last commit: <span className="font-medium ml-0.5" style={{ color: "var(--text-secondary)" }}>{lastRunFormatted}</span>
            </div>
          )}
          {!nextRunFormatted && !lastRunFormatted && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--state-success)" }}>
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Auto-commit is enabled
            </div>
          )}
        </div>
      )}

      {/* Pending state */}
      {isPending && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Saving…
        </div>
      )}

      {/* Error */}
      {errorMessage && !isPending && (
        <div className="flex items-start gap-1.5 text-xs" role="alert" style={{ color: "var(--state-error)" }}>
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          {errorMessage}
        </div>
      )}

      {/* Save success */}
      {saveState?.ok && !isPending && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--state-success)" }}>
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Auto-commit schedule saved.
        </div>
      )}

      {/* Disable success */}
      {disableState?.ok && !isPending && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Auto-commit disabled.
        </p>
      )}

      {/* Disclosure */}
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Commits are created automatically using Blumo AI. Each commit is logged in your{" "}
        <span className="font-medium">History</span> page and fully visible on GitHub.
        You can revert any commit on GitHub at any time.
      </p>
    </div>
  );
}
