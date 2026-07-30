import "server-only";

import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env/server";
import { getDueSchedules, advanceScheduleNextRun } from "@/features/settings/schedule.service";
import { runAutoCommitForUser } from "@/features/settings/auto-commit.service";
import { sendAutoCommitSuccessEmail } from "@/lib/email/send-auto-commit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro max; free tier will use default

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function isAuthorized(authorization: string | null, secret: string): boolean {
  if (!authorization) return false;
  const supplied = Buffer.from(authorization, "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

/**
 * Loads minimal profile data needed for the notification email.
 * Returns null if the user cannot be found or has no email.
 */
async function loadUserEmailContext(userId: string): Promise<{
  email: string;
  displayName: string;
} | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    const user = data?.user;
    if (!user?.email) return null;
    const name =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.user_name as string | undefined) ??
      user.email;
    return { email: user.email, displayName: name };
  } catch {
    return null;
  }
}

/**
 * Hourly Vercel Cron route.
 * Finds all users whose auto-commit schedule is due and runs the
 * generate → auto-approve → commit pipeline for each one.
 *
 * Protected by CRON_SECRET bearer token — never callable from the browser.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = serverEnv.CRON_SECRET;

  if (!secret) {
    return jsonResponse(
      { data: null, error: { code: "CRON_NOT_CONFIGURED", message: "Scheduled service is not configured." } },
      503
    );
  }

  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return jsonResponse(
      { data: null, error: { code: "UNAUTHORIZED", message: "Unauthorized." } },
      401
    );
  }

  // Load all due schedules (users who opted in and whose next_run_at has passed)
  const dueSchedules = await getDueSchedules();

  if (dueSchedules.length === 0) {
    return jsonResponse({ data: { processed: 0, succeeded: 0, skipped: 0, failed: 0 }, error: null }, 200);
  }

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const schedule of dueSchedules) {
    const result = await runAutoCommitForUser(
      schedule.userId,
      schedule.scheduleId
    );

    if (result.code === "committed") {
      // Advance next_run_at by 24 hours
      await advanceScheduleNextRun(schedule.scheduleId, new Date());

      // Send notification email (fire-and-forget, never blocks commit)
      if (result.commitUrl && result.commitSha && result.taskId) {
        const ctx = await loadUserEmailContext(schedule.userId);
        if (ctx) {
          sendAutoCommitSuccessEmail({
            recipientEmail: ctx.email,
            recipientName: ctx.displayName,
            missionTitle: result.missionTitle ?? "Daily mission",
            repositoryFullName: result.repositoryFullName ?? "",
            branch: result.branch ?? "",
            filePath: result.filePath ?? "",
            commitUrl: result.commitUrl,
            commitSha: result.commitSha,
            taskId: result.taskId,
          }).catch(() => {
            // Email failure never changes commit status
          });
        }
      }

      succeeded += 1;
    } else if (
      result.code === "already_committed_today" ||
      result.code === "no_active_goal" ||
      result.code === "no_active_repository"
    ) {
      // Still advance next_run_at so we don't re-check this user for 24h
      await advanceScheduleNextRun(schedule.scheduleId, new Date());
      skipped += 1;
    } else {
      // For transient failures (generation_failed, commit_failed, etc.),
      // do NOT advance next_run_at — the cron will retry on the next hourly tick.
      failed += 1;
    }
  }

  return jsonResponse(
    {
      data: {
        processed: dueSchedules.length,
        succeeded,
        skipped,
        failed,
      },
      error: null,
    },
    200
  );
}

