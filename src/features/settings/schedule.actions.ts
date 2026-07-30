"use server";

import { z } from "zod";
import { getUser } from "@/features/auth/get-user";
import { upsertSchedule, deleteSchedule } from "./schedule.service";
import type { ActionResult } from "@/types/action-result";

// --------------------------------------------------------------------------
// Input validation
// --------------------------------------------------------------------------

const saveScheduleSchema = z.object({
  localTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format — use HH:MM"),
  timezone: z.string().min(1).max(60),
});

// --------------------------------------------------------------------------
// Actions
// --------------------------------------------------------------------------

export type ScheduleActionResult = ActionResult<{ enabled: boolean }>;

export async function saveAutoCommitScheduleAction(
  _prev: ScheduleActionResult | null,
  formData: FormData
): Promise<ScheduleActionResult> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: { code: "unauthorized", message: "Your session has expired. Please sign in again." } };
  }

  const raw = {
    localTime: formData.get("localTime"),
    timezone: formData.get("timezone"),
  };

  const parsed = saveScheduleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid schedule settings. Please check the time format.",
        fieldErrors: Object.fromEntries(
          Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v ?? []])
        ),
      },
    };
  }

  const result = await upsertSchedule(
    user.id,
    parsed.data.timezone,
    parsed.data.localTime
  );

  if (!result.ok) {
    return { ok: false, error: { code: "save_failed", message: result.message } };
  }

  return { ok: true, data: { enabled: true } };
}

export async function disableAutoCommitAction(): Promise<ScheduleActionResult> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: { code: "unauthorized", message: "Your session has expired. Please sign in again." } };
  }

  const result = await deleteSchedule(user.id);
  if (!result.ok) {
    return { ok: false, error: { code: "save_failed", message: result.message } };
  }

  return { ok: true, data: { enabled: false } };
}
