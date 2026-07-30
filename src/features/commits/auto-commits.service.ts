import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveSchedule, type AutoCommitSchedule } from "@/features/settings/schedule.service";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface AutoCommitCommit {
  id: string;
  taskId: string | null;
  missionTitle: string;
  repositoryFullName: string;
  branch: string;
  filePath: string;
  commitSha: string;
  commitUrl: string;
  createdAt: string;
  isAutoCommit: boolean;
}

export interface AutoCommitStats {
  totalCommits: number;
  autoCommits: number;
  manualCommits: number;
  currentStreak: number;    // consecutive days with a commit
  longestStreak: number;
  lastCommitAt: string | null;
  repositoryCounts: { fullName: string; count: number }[];
  schedule: AutoCommitSchedule | null;
}

export interface AutoCommitsPageData {
  stats: AutoCommitStats;
  recentCommits: AutoCommitCommit[];
  hasAnyCommit: boolean;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function toDateStr(iso: string): string {
  return iso.slice(0, 10);
}

function computeStreaks(dates: string[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };

  // Unique sorted days descending
  const uniqueDays = [...new Set(dates.map(toDateStr))].sort((a, b) =>
    b.localeCompare(a)
  );

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  let current = 0;
  let longest = 0;
  let streak = 0;
  let prev: string | null = null;

  for (let i = 0; i < uniqueDays.length; i++) {
    const day = uniqueDays[i];
    if (i === 0) {
      // Current streak only counts if today or yesterday has a commit
      if (day === today || day === yesterday) {
        streak = 1;
        current = 1;
      } else {
        streak = 1;
        current = 0; // streak broken before today
      }
    } else {
      const prevDay = prev!;
      const diff =
        (new Date(prevDay).getTime() - new Date(day).getTime()) / 86_400_000;
      if (diff === 1) {
        streak += 1;
        if (current > 0) current = streak;
      } else {
        streak = 1;
      }
    }
    if (streak > longest) longest = streak;
    prev = day;
  }

  return { current, longest };
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

export async function getAutoCommitsPageData(
  userId: string
): Promise<AutoCommitsPageData | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();

    // Load all commits for this user
    const { data: commitRows, error: commitError } = await supabase
      .from("commits")
      .select(
        "id, task_id, github_commit_sha, github_commit_url, branch, file_path, status, created_at, repositories(full_name)"
      )
      .eq("user_id", userId)
      .in("status", ["created", "reconciled"])
      .order("created_at", { ascending: false })
      .limit(200);

    if (commitError) return null;

    const commits = commitRows ?? [];

    // Load task titles
    const taskIds = [...new Set(commits.map((r) => r.task_id).filter(Boolean) as string[])];
    const taskTitleMap: Record<string, string> = {};

    if (taskIds.length > 0) {
      const { data: taskRows } = await supabase
        .from("daily_tasks")
        .select("id, title")
        .eq("user_id", userId)
        .in("id", taskIds);
      for (const t of taskRows ?? []) {
        if (typeof t.id === "string") {
          taskTitleMap[t.id] = typeof t.title === "string" ? t.title : "Daily mission";
        }
      }
    }

    // Identify auto-commits via audit_logs
    const { data: autoAuditRows } = await admin
      .from("audit_logs")
      .select("resource_id, metadata")
      .eq("user_id", userId)
      .eq("action", "mission_auto_approved")
      .in("resource_id", taskIds);

    const autoTaskIds = new Set<string>(
      (autoAuditRows ?? [])
        .map((r) => r.resource_id)
        .filter((id): id is string => typeof id === "string")
    );

    // Build commit list
    const recentCommits: AutoCommitCommit[] = commits.map((row) => {
      const taskId = typeof row.task_id === "string" ? row.task_id : null;
      const repoRel = row.repositories as { full_name?: string } | null;
      return {
        id: row.id,
        taskId,
        missionTitle: taskId ? (taskTitleMap[taskId] ?? "Daily mission") : "Daily mission",
        repositoryFullName: repoRel?.full_name ?? "",
        branch: typeof row.branch === "string" ? row.branch : "",
        filePath: typeof row.file_path === "string" ? row.file_path : "",
        commitSha: typeof row.github_commit_sha === "string" ? row.github_commit_sha.slice(0, 8) : "",
        commitUrl: typeof row.github_commit_url === "string" ? row.github_commit_url : "",
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        isAutoCommit: taskId ? autoTaskIds.has(taskId) : false,
      };
    });

    // Stats
    const totalCommits = recentCommits.length;
    const autoCommits = recentCommits.filter((c) => c.isAutoCommit).length;
    const manualCommits = totalCommits - autoCommits;
    const lastCommitAt = recentCommits[0]?.createdAt ?? null;

    const streaks = computeStreaks(recentCommits.map((c) => c.createdAt));

    // Repository breakdown
    const repoCountMap: Record<string, number> = {};
    for (const c of recentCommits) {
      if (c.repositoryFullName) {
        repoCountMap[c.repositoryFullName] = (repoCountMap[c.repositoryFullName] ?? 0) + 1;
      }
    }
    const repositoryCounts = Object.entries(repoCountMap)
      .map(([fullName, count]) => ({ fullName, count }))
      .sort((a, b) => b.count - a.count);

    // Schedule
    const schedule = await getActiveSchedule(userId);

    return {
      stats: {
        totalCommits,
        autoCommits,
        manualCommits,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
        lastCommitAt,
        repositoryCounts,
        schedule,
      },
      recentCommits: recentCommits.slice(0, 50),
      hasAnyCommit: totalCommits > 0,
    };
  } catch {
    return null;
  }
}
