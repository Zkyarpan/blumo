"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  onboardingSchema,
  EXPERIENCE_LEVELS,
  DAILY_MINUTES,
  TASK_TYPES,
  TIMEZONES,
  type OnboardingInput,
  type ExperienceLevel,
  type TaskType,
} from "./onboarding.schema";

/**
 * Local form values type — daily_minutes widened to `number` for react-hook-form
 * compatibility. The Zod resolver re-narrows it to `DailyMinutes` at parse time.
 */
type FormValues = Omit<OnboardingInput, "daily_minutes"> & {
  daily_minutes: number;
};
import { submitOnboarding } from "./onboarding.actions";
import type { ActionResult } from "@/types/action-result";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: ActionResult<null> = { ok: true, data: null };

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Beginner (< 1 year)",
  intermediate: "Intermediate (1–3 years)",
  advanced: "Advanced (3+ years)",
};

const DAILY_MINUTES_LABELS: Record<number, string> = {
  10: "10 minutes",
  20: "20 minutes",
  30: "30 minutes",
  45: "45 minutes",
  60: "1 hour",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  learning_note: "Learning note",
  coding_challenge: "Coding challenge",
  documentation: "Documentation",
  interview_preparation: "Interview preparation",
};

export function OnboardingForm() {
  const router = useRouter();
  const [serverResult, formAction] = useActionState(
    submitOnboarding,
    INITIAL_STATE
  );
  const [isPending, startTransition] = useTransition();
  const firstErrorRef = useRef<HTMLElement | null>(null);
  // Track whether the form was submitted at least once to avoid navigating
  // on the identical initial state which also has ok:true.
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(onboardingSchema) as Resolver<FormValues>,
    defaultValues: {
      title: "",
      technology: "",
      experience_level: "beginner" as ExperienceLevel,
      daily_minutes: 30,
      task_type: "learning_note" as TaskType,
      timezone: "UTC",
    },
  });

  // Navigate to /dashboard once the action returns ok:true after a real submission.
  useEffect(() => {
    if (hasSubmitted && serverResult.ok && !isPending) {
      router.push("/dashboard");
    }
  }, [hasSubmitted, serverResult, isPending, router]);

  // Sync server-side field errors back into react-hook-form
  useEffect(() => {
    if (!serverResult.ok && serverResult.error.fieldErrors) {
      const fieldErrors = serverResult.error.fieldErrors;
      (Object.keys(fieldErrors) as Array<keyof FormValues>).forEach(
        (field) => {
          const msgs = fieldErrors[field];
          if (msgs?.[0]) {
            setError(field, { message: msgs[0] });
          }
        }
      );
    }
  }, [serverResult, setError]);

  // Focus first field with an error after failed submission
  useEffect(() => {
    if (firstErrorRef.current) {
      firstErrorRef.current.focus();
      firstErrorRef.current = null;
    }
  });

  function onSubmit(data: FormValues) {
    setHasSubmitted(true);
    const formData = new FormData();
    formData.set("title", data.title);
    formData.set("technology", data.technology);
    formData.set("experience_level", data.experience_level);
    formData.set("daily_minutes", String(data.daily_minutes));
    formData.set("task_type", data.task_type);
    formData.set("timezone", data.timezone);

    startTransition(() => {
      formAction(formData);
    });
  }

  const serverError =
    !serverResult.ok && !serverResult.error.fieldErrors
      ? serverResult.error.message
      : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Heading */}
      <h1
        className="text-xl font-semibold mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        Set up your learning profile
      </h1>

      {/* Progress bar — single page so 100% */}
      <div className="mb-8 mt-3">
        <Progress value={100} aria-label="Onboarding progress: Step 1 of 1" />
      </div>

      {/* ── Field 1: Development goal ─────────────────────────────── */}
      <div className="mb-6 space-y-1">
        <Label
          htmlFor="title"
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Development goal
        </Label>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Blumo uses this to tailor mission difficulty and content.
        </p>
        <Input
          id="title"
          type="text"
          placeholder='e.g. "Get a junior React developer job"'
          aria-required="true"
          aria-describedby={errors.title ? "title-error" : undefined}
          aria-invalid={!!errors.title}
          {...register("title")}
        />
        {errors.title && (
          <p
            id="title-error"
            role="alert"
            className="text-sm"
            style={{ color: "var(--state-error)" }}
            ref={(el) => {
              if (el && !firstErrorRef.current) firstErrorRef.current = el;
            }}
          >
            {errors.title.message}
          </p>
        )}
      </div>

      {/* ── Field 2: Technology ───────────────────────────────────── */}
      <div className="mb-6 space-y-1">
        <Label
          htmlFor="technology"
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Technology
        </Label>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Blumo generates missions using the specific language or framework.
        </p>
        <Input
          id="technology"
          type="text"
          placeholder='e.g. "React", "Python", "TypeScript"'
          aria-required="true"
          aria-describedby={errors.technology ? "technology-error" : undefined}
          aria-invalid={!!errors.technology}
          {...register("technology")}
        />
        {errors.technology && (
          <p
            id="technology-error"
            role="alert"
            className="text-sm"
            style={{ color: "var(--state-error)" }}
            ref={(el) => {
              if (el && !firstErrorRef.current) firstErrorRef.current = el;
            }}
          >
            {errors.technology.message}
          </p>
        )}
      </div>

      {/* ── Field 3: Experience level ─────────────────────────────── */}
      <div className="mb-6 space-y-1">
        <Label
          htmlFor="experience_level"
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Experience level
        </Label>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Blumo adjusts mission complexity to match your current skill.
        </p>
        <Controller
          name="experience_level"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              name={field.name}
            >
              <SelectTrigger
                id="experience_level"
                className="w-full"
                aria-required="true"
                aria-describedby={
                  errors.experience_level
                    ? "experience_level-error"
                    : undefined
                }
                aria-invalid={!!errors.experience_level}
              >
                <SelectValue placeholder="Select level">
                  {(v: string) => EXPERIENCE_LABELS[v] ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {EXPERIENCE_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.experience_level && (
          <p
            id="experience_level-error"
            role="alert"
            className="text-sm"
            style={{ color: "var(--state-error)" }}
          >
            {errors.experience_level.message}
          </p>
        )}
      </div>

      {/* ── Field 4: Daily available minutes ─────────────────────── */}
      <div className="mb-6 space-y-1">
        <Label
          htmlFor="daily_minutes"
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Daily available time
        </Label>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Blumo sizes each mission to fit the available time.
        </p>
        <Controller
          name="daily_minutes"
          control={control}
          render={({ field }) => (
            <Select
              value={String(field.value)}
              onValueChange={(v) => field.onChange(Number(v))}
              name={field.name}
            >
              <SelectTrigger
                id="daily_minutes"
                className="w-full"
                aria-required="true"
                aria-describedby={
                  errors.daily_minutes ? "daily_minutes-error" : undefined
                }
                aria-invalid={!!errors.daily_minutes}
              >
                <SelectValue placeholder="Select time">
                  {(v: string) => DAILY_MINUTES_LABELS[Number(v)] ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DAILY_MINUTES.map((mins) => (
                  <SelectItem key={mins} value={String(mins)}>
                    {DAILY_MINUTES_LABELS[mins]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.daily_minutes && (
          <p
            id="daily_minutes-error"
            role="alert"
            className="text-sm"
            style={{ color: "var(--state-error)" }}
          >
            {errors.daily_minutes.message}
          </p>
        )}
      </div>

      {/* ── Field 5: Task type ────────────────────────────────────── */}
      <div className="mb-6 space-y-1">
        <Label
          htmlFor="task_type"
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Preferred task type
        </Label>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Blumo matches the mission format to what you find most useful.
        </p>
        <Controller
          name="task_type"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              name={field.name}
            >
              <SelectTrigger
                id="task_type"
                className="w-full"
                aria-required="true"
                aria-describedby={
                  errors.task_type ? "task_type-error" : undefined
                }
                aria-invalid={!!errors.task_type}
              >
                <SelectValue placeholder="Select type">
                  {(v: string) => TASK_TYPE_LABELS[v] ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {TASK_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.task_type && (
          <p
            id="task_type-error"
            role="alert"
            className="text-sm"
            style={{ color: "var(--state-error)" }}
          >
            {errors.task_type.message}
          </p>
        )}
      </div>

      {/* ── Field 6: Timezone ─────────────────────────────────────── */}
      <div className="mb-8 space-y-1">
        <Label
          htmlFor="timezone"
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Timezone
        </Label>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Blumo records mission dates relative to your local day.
        </p>
        <Controller
          name="timezone"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              name={field.name}
            >
              <SelectTrigger
                id="timezone"
                className="w-full"
                aria-required="true"
                aria-describedby={
                  errors.timezone ? "timezone-error" : undefined
                }
                aria-invalid={!!errors.timezone}
              >
                <SelectValue placeholder="Select timezone">
                  {(v: string) =>
                    TIMEZONES.find((tz) => tz.value === v)?.label ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.timezone && (
          <p
            id="timezone-error"
            role="alert"
            className="text-sm"
            style={{ color: "var(--state-error)" }}
          >
            {errors.timezone.message}
          </p>
        )}
      </div>

      {/* Server error banner */}
      {serverError && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--state-error-soft)",
            borderColor: "var(--state-error)",
            color: "var(--state-error)",
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>{serverError}</span>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={isPending}
        aria-disabled={isPending}
        className={isPending ? "cursor-not-allowed" : ""}
      >
        {isPending ? (
          <>
            <svg
              className="mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Saving…
          </>
        ) : (
          "Get started →"
        )}
      </Button>
    </form>
  );
}
