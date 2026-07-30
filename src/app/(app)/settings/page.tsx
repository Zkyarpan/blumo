import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  User,
  Target,
  Github,
  Bell,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Clock,
  Mail,
  MessageSquare,
  Zap,
} from "lucide-react";
import { getUser } from "@/features/auth/get-user";
import { PageContainer } from "@/components/layout/PageContainer";
import { Separator } from "@/components/ui/separator";
import { getSettingsData } from "@/features/settings/settings.service";
import { signOut } from "@/features/auth/sign-out.actions";
import { EmailPreferencesForm } from "@/features/settings/EmailPreferencesForm";
import { TestEmailButton } from "@/features/settings/TestEmailButton";
import { SupportForm } from "@/features/settings/SupportForm";
import { AutoCommitSettings } from "@/features/settings/AutoCommitSettings";

export const metadata: Metadata = {
  title: "Settings — Blumo",
  description: "Manage your Blumo account and preferences.",
};

// --------------------------------------------------------------------------
// Section wrapper
// --------------------------------------------------------------------------

function SettingsSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl border"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-5 py-4"
        style={{ borderColor: "var(--border-default)" }}
      >
        <Icon
          className="size-4"
          aria-hidden={true}
          // @ts-expect-error style prop is valid
          style={{ color: "var(--text-muted)" }}
        />
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// --------------------------------------------------------------------------
// Row helper
// --------------------------------------------------------------------------

function SettingsRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt
        className="text-xs font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </dt>
      <dd
        className={`text-sm ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </dd>
    </div>
  );
}

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  learning_note: "Learning note",
  coding_challenge: "Coding challenge",
  documentation_task: "Documentation task",
  interview_prep: "Interview prep note",
};

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const data = await getSettingsData(user.id);

  if (!data) {
    return (
      <PageContainer width="wide" className="py-10">
        <div
          role="alert"
          className="rounded-xl border p-6"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <p className="font-medium" style={{ color: "var(--state-error)" }}>
            Unable to load settings.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Refresh the page or{" "}
            <Link
              href="/dashboard"
              className="underline underline-offset-4"
              style={{ color: "var(--accent-primary)" }}
            >
              return to the dashboard
            </Link>
            .
          </p>
        </div>
      </PageContainer>
    );
  }

  const { profile, goal, github, emailPreferences, autoCommitSchedule, resend } = data;
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <PageContainer width="wide" className="py-10">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="text-2xl font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Settings
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Your profile, preferences, GitHub connection, and notifications.
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile */}
        <SettingsSection title="Profile" icon={User}>
          <div className="flex items-center gap-4 mb-4">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.displayName ?? "Avatar"}
                className="size-14 rounded-full border"
                style={{ borderColor: "var(--border-default)" }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="size-14 rounded-full flex items-center justify-center text-lg font-semibold select-none"
                style={{
                  backgroundColor: "var(--accent-soft)",
                  color: "var(--accent-strong)",
                }}
                aria-hidden="true"
              >
                {(profile.displayName ?? "?").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {profile.displayName ?? "—"}
              </p>
              {profile.githubUsername && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  @{profile.githubUsername}
                </p>
              )}
              {user.email && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {user.email}
                </p>
              )}
            </div>
          </div>

          <dl className="divide-y" style={{ borderColor: "var(--border-default)" }}>
            <SettingsRow
              label="Display name"
              value={profile.displayName ?? "—"}
            />
            <SettingsRow
              label="GitHub username"
              value={profile.githubUsername ? `@${profile.githubUsername}` : "—"}
              mono
            />
            <SettingsRow
              label="Timezone"
              value={profile.timezone ?? "—"}
            />
            <SettingsRow
              label="Experience level"
              value={
                profile.experienceLevel
                  ? (EXPERIENCE_LABELS[profile.experienceLevel] ??
                    profile.experienceLevel)
                  : "—"
              }
            />
          </dl>

          <p
            className="mt-3 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            To update your profile, complete onboarding again or contact support.
          </p>
        </SettingsSection>

        {/* Learning preferences */}
        <SettingsSection title="Learning preferences" icon={Target}>
          {goal ? (
            <dl className="divide-y" style={{ borderColor: "var(--border-default)" }}>
              <SettingsRow label="Current goal" value={goal.title} />
              <SettingsRow
                label="Technology"
                value={goal.technology}
              />
              <SettingsRow
                label="Task type"
                value={TASK_TYPE_LABELS[goal.taskType] ?? goal.taskType}
              />
              <SettingsRow
                label="Daily minutes"
                value={
                  <span className="flex items-center gap-1">
                    <Clock
                      className="size-3.5"
                      aria-hidden={true}
                    />
                    {goal.dailyMinutes} minutes
                  </span>
                }
              />
            </dl>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No active goal.{" "}
              <Link
                href="/onboarding"
                className="underline underline-offset-4 cursor-pointer"
                style={{ color: "var(--accent-primary)" }}
              >
                Complete onboarding
              </Link>{" "}
              to set your learning goal.
            </p>
          )}
        </SettingsSection>

        {/* GitHub connection */}
        <SettingsSection title="GitHub connection" icon={Github}>
          <dl className="divide-y" style={{ borderColor: "var(--border-default)" }}>
            <SettingsRow
              label="Installation status"
              value={
                github.installationStatus === "active" ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2
                      className="size-3.5"
                      aria-hidden={true}
                      style={{ color: "var(--state-success)" }}
                    />
                    <span style={{ color: "var(--state-success)" }}>
                      Connected
                    </span>
                  </span>
                ) : github.installationStatus === "suspended" ? (
                  <span className="flex items-center gap-1.5">
                    <AlertCircle
                      className="size-3.5"
                      aria-hidden={true}
                      style={{ color: "var(--state-warning)" }}
                    />
                    <span style={{ color: "var(--state-warning)" }}>
                      Suspended
                    </span>
                  </span>
                ) : github.installationStatus === "uninstalled" ? (
                  <span className="flex items-center gap-1.5">
                    <AlertCircle
                      className="size-3.5"
                      aria-hidden={true}
                      style={{ color: "var(--state-error)" }}
                    />
                    <span style={{ color: "var(--state-error)" }}>
                      Uninstalled
                    </span>
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>
                    Not connected
                  </span>
                )
              }
            />
            {github.selectedRepository ? (
              <SettingsRow
                label="Selected repository"
                value={
                  <span className="flex flex-col gap-0.5">
                    <span className="font-mono">
                      {github.selectedRepository.fullName}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Default branch: {github.selectedRepository.defaultBranch}
                    </span>
                  </span>
                }
              />
            ) : (
              <div className="py-2">
                <p
                  className="text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  No repository selected.
                </p>
              </div>
            )}
          </dl>

          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/github/repositories"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              Manage repositories
            </Link>
            <Link
              href="/github/connect"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              Reconnect GitHub App
            </Link>
          </div>
        </SettingsSection>

        {/* Auto-commit */}
        <SettingsSection title="Auto-commit" icon={Zap}>
          <AutoCommitSettings
            schedule={autoCommitSchedule}
            userTimezone={profile.timezone ?? "UTC"}
          />
        </SettingsSection>

        {/* Email notifications */}
        <SettingsSection title="Email notifications" icon={Bell}>
          <EmailPreferencesForm
            preferences={emailPreferences}
            resendConfigured={resend.configured}
          />

          {/* Dev-only test email */}
          {isDev && (
            <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--border-default)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Mail className="size-4" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
                <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Development: test email
                </h3>
              </div>
              <TestEmailButton
                resendConfigured={resend.configured}
                userEmail={user.email ?? ""}
              />
            </div>
          )}
        </SettingsSection>

        {/* Support */}
        <SettingsSection title="Support" icon={MessageSquare}>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            Have a question or found a bug? Send us a message and we&apos;ll follow up as
            soon as possible.
          </p>
          <SupportForm />
          <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Reply-to:{" "}
            <span className="font-mono">
              {process.env.RESEND_REPLY_TO
                ? process.env.RESEND_REPLY_TO
                : "support contact not publicly listed"}
            </span>
            . Replies go to our support inbox — not to{" "}
            <span className="font-mono">support@mail.arpankarki.com.np</span> (which is
            a sending-only address, not an inbox).
          </p>
        </SettingsSection>

        <Separator style={{ borderColor: "var(--border-default)" }} />

        {/* Sign out */}
        <section>
          <h2
            className="text-sm font-semibold mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Account
          </h2>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium cursor-pointer transition-colors hover:bg-[var(--state-error-soft)]"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--state-error)",
              }}
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </section>
      </div>
    </PageContainer>
  );
}
