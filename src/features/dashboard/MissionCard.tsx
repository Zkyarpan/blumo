import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Clock3,
  GitBranch,
  GraduationCap,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MissionGenerator } from "@/features/missions/MissionGenerator";
import type { DashboardData } from "./dashboard.service";

interface MissionCardProps {
  activeGoal: DashboardData["activeGoal"];
  installationStatus: DashboardData["installationStatus"];
  selectedRepository: DashboardData["selectedRepository"];
  todayMission: DashboardData["todayMission"];
}

function MissionLoading() {
  return (
    <div className="min-h-44 space-y-4 py-4" aria-busy="true" role="status">
      <p className="font-medium" style={{ color: "var(--text-primary)" }}>
        Creating your mission…
      </p>
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-9 w-44" />
      </div>
    </div>
  );
}

function MissionPrerequisite({
  title,
  description,
  href,
  action,
  external = false,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
  external?: boolean;
}) {
  const className =
    "inline-flex text-sm font-medium underline underline-offset-4";
  const style = { color: "var(--accent-strong)" };

  return (
    <div
      className="min-h-44 rounded-lg border-2 border-dashed p-7 text-center"
      style={{ borderColor: "var(--border-default)" }}
    >
      <AlertTriangle
        className="mx-auto size-8"
        aria-hidden="true"
        style={{ color: "var(--state-warning)" }}
      />
      <p className="mt-3 font-medium" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-lg text-sm" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>
      {external ? (
        <a href={href} className={`mt-4 ${className}`} style={style}>
          {action}
        </a>
      ) : (
        <Link href={href} className={`mt-4 ${className}`} style={style}>
          {action}
        </Link>
      )}
    </div>
  );
}

const MISSION_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  generated: { label: "Awaiting review", color: "var(--state-warning)", bg: "var(--state-warning-soft)" },
  approved: { label: "Approved", color: "var(--state-success)", bg: "var(--state-success-soft)" },
  rejected: { label: "Rejected", color: "var(--state-error)", bg: "var(--state-error-soft)" },
  in_progress: { label: "In progress", color: "var(--accent-primary)", bg: "var(--accent-soft)" },
  completed: { label: "Completed", color: "var(--state-success)", bg: "var(--state-success-soft)" },
};

function ReadyMission({
  state,
}: {
  state: Extract<DashboardData["todayMission"], { kind: "ready" }>;
}) {
  const { mission } = state;
  const statusInfo = MISSION_STATUS_LABELS[state.status] ?? MISSION_STATUS_LABELS.generated;

  return (
    <div className="space-y-5">
      <p className="sr-only" role="status">
        Today&apos;s mission is ready.
      </p>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            style={{
              color: statusInfo.color,
              backgroundColor: statusInfo.bg,
            }}
          >
            <Check aria-hidden="true" /> {statusInfo.label}
          </Badge>
          <Badge variant="outline">{mission.difficulty}</Badge>
        </div>
        <h2 className="mt-3 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          {mission.title}
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          {mission.description}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-4" aria-hidden="true" />
          {mission.estimated_minutes} minutes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="size-4" aria-hidden="true" />
          {mission.suggested_branch}
        </span>
        <span className="font-mono">{state.repositoryName}</span>
      </div>

      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Acceptance checklist
        </h3>
        <ul className="mt-2 space-y-2">
          {mission.acceptance_checklist.map((item) => (
            <li key={item} className="flex gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border-default)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Suggested commit message
          </p>
          <p className="mt-1 font-mono text-sm" style={{ color: "var(--text-primary)" }}>
            {mission.suggested_commit_message}
          </p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border-default)" }}>
          <p className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            <GraduationCap className="size-4" aria-hidden="true" /> Learning outcome
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
            {mission.learning_outcome}
          </p>
        </div>
      </div>

      {(state.status === "generated" || state.status === "rejected") && (
        <div>
          <Link
            href={`/tasks/${state.taskId}/review`}
            className="inline-flex items-center text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--accent-strong)" }}
          >
            {state.status === "generated" ? "Review and approve mission →" : "View rejected mission →"}
          </Link>
        </div>
      )}
      {state.status === "approved" && (
        <div>
          <Link
            href={`/tasks/${state.taskId}`}
            className="inline-flex items-center text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--accent-strong)" }}
          >
            View approved mission →
          </Link>
        </div>
      )}
    </div>
  );
}

export function MissionCard({
  activeGoal,
  installationStatus,
  selectedRepository,
  todayMission,
}: MissionCardProps) {
  let content;

  if (todayMission.kind === "ready") {
    content = <ReadyMission state={todayMission} />;
  } else if (todayMission.kind === "generating") {
    content = <MissionLoading />;
  } else if (!activeGoal) {
    content = (
      <MissionPrerequisite
        title="Choose a learning goal"
        description="An active goal is required before Blumo can create a focused mission."
        href="/onboarding"
        action="Review learning goal"
      />
    );
  } else if (installationStatus === null) {
    content = (
      <MissionPrerequisite
        title="Connect GitHub first"
        description="Install the Blumo GitHub App before generating a repository-linked mission."
        href="/github/connect"
        action="Connect GitHub"
      />
    );
  } else if (installationStatus === "suspended") {
    content = (
      <MissionPrerequisite
        title="GitHub access is suspended"
        description="Restore the installation before generating another mission."
        href="https://github.com/settings/installations"
        action="Manage GitHub access"
        external
      />
    );
  } else if (installationStatus === "uninstalled") {
    content = (
      <MissionPrerequisite
        title="Reconnect the GitHub App"
        description="The previous installation is no longer active. Reconnect before generating a mission."
        href="/github/connect"
        action="Reconnect GitHub"
      />
    );
  } else if (!selectedRepository) {
    content = (
      <MissionPrerequisite
        title="Select an active repository"
        description="Choose the one repository this mission should be associated with."
        href="/github/repositories"
        action="Manage repositories"
      />
    );
  } else if (todayMission.kind === "failed") {
    content = (
      <MissionGenerator
        retry
        initialErrorCode={todayMission.errorCode}
        attempts={todayMission.generationAttempts}
        canRetry={todayMission.canRetry}
        goalTitle={activeGoal.title}
        dailyMinutes={activeGoal.daily_minutes}
      />
    );
  } else if (todayMission.kind === "invalid") {
    content = (
      <div role="alert" className="min-h-44 py-6">
        <p className="font-medium" style={{ color: "var(--state-error)" }}>
          Today&apos;s mission could not be loaded.
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Refresh the page. If the problem continues, try again later.
        </p>
      </div>
    );
  } else {
    content = (
      <MissionGenerator
        goalTitle={activeGoal.title}
        dailyMinutes={activeGoal.daily_minutes}
      />
    );
  }

  return (
    <Card
      className="rounded-xl border"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Zap size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
          <CardTitle className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Today&apos;s mission
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
