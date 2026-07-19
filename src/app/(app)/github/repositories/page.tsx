import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { getProfile } from "@/features/auth/get-profile";
import { getUser } from "@/features/auth/get-user";
import { RepositoryAccessState } from "@/features/github/RepositoryAccessState";
import { RepositoryList } from "@/features/github/RepositoryList";
import {
  syncRepositories,
  type SyncedRepository,
} from "@/features/github/repository-sync.service";
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
  const { data: installation, error: installationError } = await supabase
    .from("github_installations")
    .select("id, status")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (installationError) {
    return <RepositoryPageContent syncError="DB_ERROR" />;
  }

  if (!installation) {
    return <RepositoryPageContent accessState="missing" />;
  }

  if (installation.status === "uninstalled") {
    return <RepositoryPageContent accessState="uninstalled" />;
  }

  if (installation.status === "suspended") {
    const { data: repositoryData, error: repositoryError } = await supabase
      .from("repositories")
      .select(
        "id, github_repository_id, owner, name, full_name, default_branch, is_private, is_selected, access_status"
      )
      .eq("user_id", user.id)
      .eq("installation_id", installation.id)
      .order("full_name", { ascending: true });

    if (repositoryError) {
      return <RepositoryPageContent syncError="DB_ERROR" />;
    }

    return (
      <RepositoryPageContent
        accessState="suspended"
        repositories={(repositoryData ?? []) as SyncedRepository[]}
      />
    );
  }

  if (installation.status !== "active") {
    return <RepositoryPageContent syncError="DB_ERROR" />;
  }

  const syncResult = await syncRepositories(user.id);
  if (!syncResult.ok) {
    if (syncResult.errorCode === "NO_ACTIVE_INSTALLATION") {
      return <RepositoryPageContent accessState="missing" />;
    }

    if (syncResult.errorCode === "INSTALLATION_SUSPENDED") {
      return <RepositoryPageContent accessState="suspended" />;
    }

    return (
      <RepositoryPageContent
        syncError={
          syncResult.errorCode === "GITHUB_UNAVAILABLE" ||
          syncResult.errorCode === "TOKEN_FAILED"
            ? "GITHUB_UNAVAILABLE"
            : "DB_ERROR"
        }
      />
    );
  }

  return <RepositoryPageContent repositories={syncResult.repositories} />;
}

interface RepositoryPageContentProps {
  accessState?: "missing" | "suspended" | "uninstalled";
  repositories?: SyncedRepository[];
  syncError?: "GITHUB_UNAVAILABLE" | "DB_ERROR";
}

function RepositoryPageContent({
  accessState,
  repositories = [],
  syncError,
}: RepositoryPageContentProps) {
  const currentSelection = repositories.find(
    (repository) => repository.is_selected && repository.access_status === "active"
  );

  return (
    <PageContainer width="default" className="py-10">
      <div className="space-y-6">
        <PageHeading />
        {accessState && <RepositoryAccessState state={accessState} />}
        {(!accessState || accessState === "suspended") && (
          <RepositoryList
            repositories={repositories}
            currentSelectionId={currentSelection?.id ?? null}
            syncError={syncError}
            installationStatus={
              accessState === "suspended" ? "suspended" : "active"
            }
          />
        )}
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
