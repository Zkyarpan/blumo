import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { getProfile } from "@/features/auth/get-profile";
import { getUser } from "@/features/auth/get-user";
import { RepositoryList } from "@/features/github/RepositoryList";
import { syncRepositories } from "@/features/github/repository-sync.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Repositories — Blumo",
  description: "Synchronize and select your active GitHub repository.",
};

export default async function RepositoriesPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  const supabase = await createSupabaseServerClient();
  const { data: installations, error: installationError } = await supabase
    .from("github_installations")
    .select("id, status")
    .eq("user_id", user.id);

  if (!installationError) {
    const hasActiveInstallation = installations?.some(
      (installation) => installation.status === "active"
    );

    if (!hasActiveInstallation) {
      const hasSuspendedInstallation = installations?.some(
        (installation) => installation.status === "suspended"
      );

      redirect(
        hasSuspendedInstallation
          ? "/github/connect?error=installation_suspended"
          : "/github/connect"
      );
    }
  }

  const syncResult = await syncRepositories(user.id);

  if (!syncResult.ok) {
    if (syncResult.errorCode === "NO_ACTIVE_INSTALLATION") {
      redirect("/github/connect");
    }

    if (syncResult.errorCode === "INSTALLATION_SUSPENDED") {
      redirect("/github/connect?error=installation_suspended");
    }

    return (
      <PageContainer width="default" className="py-10">
        <div className="space-y-6">
          <PageHeading />
          <RepositoryList
            repositories={[]}
            currentSelectionId={null}
            syncError={
              syncResult.errorCode === "GITHUB_UNAVAILABLE" ||
              syncResult.errorCode === "TOKEN_FAILED"
                ? "GITHUB_UNAVAILABLE"
                : "DB_ERROR"
            }
          />
        </div>
      </PageContainer>
    );
  }

  const currentSelection = syncResult.repositories.find(
    (repository) => repository.is_selected
  );

  return (
    <PageContainer width="default" className="py-10">
      <div className="space-y-6">
        <PageHeading />
        <RepositoryList
          repositories={syncResult.repositories}
          currentSelectionId={currentSelection?.id ?? null}
        />
      </div>
    </PageContainer>
  );
}

function PageHeading() {
  return (
    <div>
      <p
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--accent-strong)" }}
      >
        GitHub connection
      </p>
      <h1
        className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl"
        style={{ color: "var(--text-primary)" }}
      >
        Manage repositories
      </h1>
      <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--text-muted)" }}>
        Choose the one repository Blumo should use for future work. Repository
        access is always controlled from your GitHub App settings.
      </p>
    </div>
  );
}
