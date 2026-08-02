import { z } from "zod";

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const DAILY_MINUTES = [10, 20, 30, 45, 60] as const;
export type DailyMinutes = (typeof DAILY_MINUTES)[number];

export const TASK_TYPES = [
  "learning_note",
  "coding_challenge",
  "documentation",
  "interview_preparation",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** Curated IANA timezone list covering all UTC offsets.
 *  Europe/London is listed first — it covers both GMT (winter) and BST (summer)
 *  automatically, so UK users never have to think about daylight saving time.
 */
export const TIMEZONES = [
  { label: "(GMT/BST) Europe/London — United Kingdom", value: "Europe/London" },
  { label: "(UTC−11:00) Pacific/Midway",      value: "Pacific/Midway" },
  { label: "(UTC−10:00) Pacific/Honolulu",    value: "Pacific/Honolulu" },
  { label: "(UTC−09:00) America/Anchorage",   value: "America/Anchorage" },
  { label: "(UTC−08:00) America/Los_Angeles", value: "America/Los_Angeles" },
  { label: "(UTC−07:00) America/Denver",      value: "America/Denver" },
  { label: "(UTC−06:00) America/Chicago",     value: "America/Chicago" },
  { label: "(UTC−05:00) America/New_York",    value: "America/New_York" },
  { label: "(UTC−04:00) America/Halifax",     value: "America/Halifax" },
  { label: "(UTC−03:00) America/Sao_Paulo",   value: "America/Sao_Paulo" },
  { label: "(UTC−01:00) Atlantic/Azores",     value: "Atlantic/Azores" },
  { label: "(UTC+00:00) UTC",                 value: "UTC" },
  { label: "(UTC+01:00) Europe/Paris",        value: "Europe/Paris" },
  { label: "(UTC+02:00) Europe/Helsinki",     value: "Europe/Helsinki" },
  { label: "(UTC+03:00) Europe/Moscow",       value: "Europe/Moscow" },
  { label: "(UTC+04:00) Asia/Dubai",          value: "Asia/Dubai" },
  { label: "(UTC+05:00) Asia/Karachi",        value: "Asia/Karachi" },
  { label: "(UTC+05:30) Asia/Kolkata",        value: "Asia/Kolkata" },
  { label: "(UTC+06:00) Asia/Dhaka",          value: "Asia/Dhaka" },
  { label: "(UTC+07:00) Asia/Bangkok",        value: "Asia/Bangkok" },
  { label: "(UTC+08:00) Asia/Singapore",      value: "Asia/Singapore" },
  { label: "(UTC+09:00) Asia/Tokyo",          value: "Asia/Tokyo" },
  { label: "(UTC+10:00) Australia/Sydney",    value: "Australia/Sydney" },
  { label: "(UTC+12:00) Pacific/Auckland",    value: "Pacific/Auckland" },
] as const;

export const TIMEZONE_VALUES = TIMEZONES.map((t) => t.value);

export const onboardingSchema = z.object({
  title: z
    .string()
    .min(5, "Goal must be at least 5 characters.")
    .max(200, "Goal must be 200 characters or fewer."),

  technology: z
    .string()
    .min(1, "Technology is required.")
    .max(80, "Technology must be 80 characters or fewer."),

  experience_level: z.enum(EXPERIENCE_LEVELS, {
    errorMap: () => ({ message: "Select a valid experience level." }),
  }),

  daily_minutes: z.coerce
    .number()
    .refine(
      (v): v is DailyMinutes =>
        (DAILY_MINUTES as readonly number[]).includes(v),
      { message: "Select a valid daily time." }
    ),

  task_type: z.enum(TASK_TYPES, {
    errorMap: () => ({ message: "Select a valid task type." }),
  }),

  timezone: z
    .string()
    .min(1, "Timezone is required.")
    .max(60, "Timezone value is too long."),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
