"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { generateMissionAction } from "./mission-generation.actions";
import type {
  MissionActionState,
  MissionErrorCode,
} from "./mission-generation.types";

const ERROR_MESSAGES: Record<MissionErrorCode, string> = {
  unauthorized: "Your session has expired. Sign in again to create a mission.",
  invalid_request: "The mission request was not valid. Refresh and try again.",
  not_onboarded: "Complete onboarding before creating a mission.",
  invalid_timezone: "Your saved timezone is not valid. Update it before trying again.",
  no_active_goal: "Choose an active learning goal before creating a mission.",
  no_active_repository: "Select an active GitHub repository before creating a mission.",
  context_changed: "Your goal or GitHub access changed. Review it before trying again.",
  retry_exhausted: "Today’s mission could not be created after three attempts.",
  retry_not_allowed: "Mission generation is unavailable for today.",
  configuration_error: "Mission generation is currently unavailable.",
  authentication_error: "Mission generation is currently unavailable.",
  quota_exhausted: "Mission generation is currently unavailable.",
  rate_limited: "The mission service is busy. Try again shortly.",
  request_rejected: "Mission generation is currently unavailable.",
  content_rejected: "Blumo could not create a suitable mission today.",
  invalid_response: "Blumo could not create a safe, valid mission. Try again.",
  unsafe_response: "Blumo could not create a safe mission. Try again.",
  timed_out: "Mission generation took too long. Try again shortly.",
  temporarily_unavailable: "The mission service is temporarily unavailable. Try again shortly.",
  unknown_provider_error: "The mission service had a temporary problem. Try again shortly.",
  database_error: "Blumo could not save your mission. Please try again later.",
};

function SubmitButton({ retry }: { retry: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      <Sparkles aria-hidden="true" />
      {pending ? "Creating your mission…" : retry ? "Try again" : "Generate today's mission"}
    </Button>
  );
}

export interface MissionGeneratorProps {
  retry?: boolean;
  initialErrorCode?: string | null;
  attempts?: number;
  canRetry?: boolean;
  goalTitle: string;
  dailyMinutes: number;
}

export function MissionGenerator({
  retry = false,
  initialErrorCode = null,
  attempts = 0,
  canRetry = true,
  goalTitle,
  dailyMinutes,
}: MissionGeneratorProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState<MissionActionState, FormData>(
    generateMissionAction,
    null
  );

  useEffect(() => {
    if (state) router.refresh();
  }, [router, state]);

  const actionError = state && !state.ok ? state.code : null;
  const errorCode = actionError ?? initialErrorCode;
  const knownError =
    errorCode && errorCode in ERROR_MESSAGES
      ? ERROR_MESSAGES[errorCode as MissionErrorCode]
      : errorCode
        ? "Mission generation is temporarily unavailable."
        : null;
  const retryMode = retry || Boolean(state && !state.ok);
  const actionAllowsRetry = !state || state.ok || state.retryable;
  const showButton = retryMode
    ? canRetry && attempts < 3 && actionAllowsRetry
    : true;

  return (
    <div aria-busy={pending} className="min-h-44">
      {pending ? (
        <div role="status" aria-live="polite" className="space-y-4 py-4">
          <p className="font-medium" style={{ color: "var(--text-primary)" }}>
            Creating your mission…
          </p>
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-9 w-44" />
          </div>
          <Button type="button" size="lg" disabled>
            <Sparkles aria-hidden="true" /> Creating your mission…
          </Button>
        </div>
      ) : (
        <div className="space-y-4 py-2">
          <div>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>
              {retryMode ? "Let’s try today’s mission again." : "Ready for a focused next step?"}
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Blumo will create one {dailyMinutes}-minute mission for {goalTitle} using only your saved preferences and repository metadata.
            </p>
          </div>

          {knownError && (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border p-3 text-sm"
              style={{
                color: "var(--state-error)",
                backgroundColor: "var(--state-error-soft)",
                borderColor: "var(--state-error)",
              }}
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{knownError}</span>
            </div>
          )}

          {showButton ? (
            <form action={action}>
              <SubmitButton retry={retryMode} />
            </form>
          ) : attempts >= 3 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No more generation attempts are available for today.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export { ERROR_MESSAGES };
