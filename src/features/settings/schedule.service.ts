import "server-only";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface AutoCommitSchedule {
  id: string;
  timezone: string;
  localTime: string;   // HH:MM
  nextRunAt: string;   // ISO timestamp
  lastRunAt: string | null;
  isActive: boolean;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const scheduleRowSchema = z.object({
  id: z.string().uuid(),
  timezone: z.string().min(1),
  local_time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  next_run_at: z.string(),
  last_run_at: z.string().nullable(),
  is_active: z.boolean(),
});

/**
 * Computes the next UTC timestamp for the given local time + timezone.
 * Always picks the NEXT occurrence that is at least 1 minute in the future.
 */
export function computeNextRunAt(localTime: string, timezone: string): Date {
  const now = new Date();

  // Parse HH:MM
  const [hStr, mStr] = localTime.split(":");
  const hour = Number(hStr);
  const minute = Number(mStr);

  // Build today in the user's timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = formatter
    .format(now)
    .split("-")
    .map(Number);

  // Candidate: today at HH:MM local
  const candidate = new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  );
  // Adjust for timezone offset by computing offset from a reference
  const localOffset = getTimezoneOffsetMinutes(timezone, candidate);
  const utcCandidate = new Date(candidate.getTime() - localOffset * 60_000);

  // If candidate is in the past (or less than 1 min from now), add 24h
  if (utcCandidate.getTime() <= now.getTime() + 60_000) {
    return new Date(utcCandidate.getTime() + 24 * 60 * 60_000);
  }
  return utcCandidate;
}

function getTimezoneOffsetMinutes(timezone: string, date: Date): number {
  // Returns the offset in minutes that needs to be subtracted from local time
  // to produce UTC. Uses the Intl API to compute the local clock reading.
  const utcParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);

  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);

  const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const utcMinutes =
    get(utcParts, "year") * 525_600 +
    get(utcParts, "month") * 43_800 +
    get(utcParts, "day") * 1440 +
    get(utcParts, "hour") * 60 +
    get(utcParts, "minute");

  const localMinutes =
    get(localParts, "year") * 525_600 +
    get(localParts, "month") * 43_800 +
    get(localParts, "day") * 1440 +
    get(localParts, "hour") * 60 +
    get(localParts, "minute");

  return localMinutes - utcMinutes;
}

// --------------------------------------------------------------------------
// Read
// --------------------------------------------------------------------------

/** Returns the user's active schedule, or null if none. Uses RLS client. */
export async function getActiveSchedule(
  userId: string
): Promise<AutoCommitSchedule | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("schedules")
      .select("id, timezone, local_time, next_run_at, last_run_at, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data) return null;
    const parsed = scheduleRowSchema.safeParse(data);
    if (!parsed.success) return null;
    return {
      id: parsed.data.id,
      timezone: parsed.data.timezone,
      localTime: parsed.data.local_time,
      nextRunAt: parsed.data.next_run_at,
      lastRunAt: parsed.data.last_run_at,
      isActive: parsed.data.is_active,
    };
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Write (service-role RPCs — never from browser)
// --------------------------------------------------------------------------

export async function upsertSchedule(
  userId: string,
  timezone: string,
  localTime: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const nextRunAt = computeNextRunAt(localTime, timezone);
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc("upsert_auto_commit_schedule", {
      p_user_id: userId,
      p_timezone: timezone,
      p_local_time: localTime,
      p_next_run_at: nextRunAt.toISOString(),
    });
    if (error) {
      const msg = typeof error.message === "string" ? error.message : "";
      if (msg.includes("not_onboarded")) {
        return { ok: false, message: "Complete onboarding before enabling auto-commits." };
      }
      if (msg.includes("no_active_goal")) {
        return { ok: false, message: "Set a learning goal before enabling auto-commits." };
      }
      return { ok: false, message: "Could not save schedule. Please try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not save schedule. Please try again." };
  }
}

export async function deleteSchedule(
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc("delete_auto_commit_schedule", {
      p_user_id: userId,
    });
    if (error) {
      return { ok: false, message: "Could not remove schedule. Please try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not remove schedule. Please try again." };
  }
}

// --------------------------------------------------------------------------
// Cron query — returns all users with due schedules (service-role)
// --------------------------------------------------------------------------

const dueScheduleRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  timezone: z.string().min(1),
  local_time: z.string(),
  next_run_at: z.string(),
});

export interface DueSchedule {
  scheduleId: string;
  userId: string;
  timezone: string;
  localTime: string;
  nextRunAt: string;
}

export async function getDueSchedules(): Promise<DueSchedule[]> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("schedules")
      .select("id, user_id, timezone, local_time, next_run_at")
      .eq("is_active", true)
      .lte("next_run_at", new Date().toISOString())
      .limit(100);

    if (error || !data) return [];

    const result: DueSchedule[] = [];
    for (const row of data) {
      const parsed = dueScheduleRowSchema.safeParse(row);
      if (parsed.success) {
        result.push({
          scheduleId: parsed.data.id,
          userId: parsed.data.user_id,
          timezone: parsed.data.timezone,
          localTime: parsed.data.local_time,
          nextRunAt: parsed.data.next_run_at,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

export async function advanceScheduleNextRun(
  scheduleId: string,
  lastRunAt: Date
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.rpc("advance_schedule_next_run", {
      p_schedule_id: scheduleId,
      p_last_run_at: lastRunAt.toISOString(),
    });
  } catch {
    // Non-fatal: the schedule will fire again on the next cron tick
  }
}
