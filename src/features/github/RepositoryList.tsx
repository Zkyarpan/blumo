"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, GitBranch, LockKeyhole, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { selectRepositoryAction } from "@/features/github/select-repository.actions";
import type { SyncedRepository } from "@/features/github/repository-sync.service";

type SyncError = "GITHUB_UNAVAILABLE" | "DB_ERROR";

interface RepositoryListProps {
  repositories: SyncedRepository[];
  currentSelectionId: string | null;
  syncError?: SyncError;
}

const SELECTION_ERRORS: Record<string, string> = {
  UNAUTHENTICATED: "Your session has expired. Sign in and try again.",
  NOT_ONBOARDED: "Complete onboarding before selecting a repository.",
  NO_ACTIVE_INSTALLATION: "Reconnect the GitHub App before selecting a repository.",
  REPOSITORY_NOT_FOUND: "This repository could not be found for your account.",
  REPOSITORY_NOT_ACCESSIBLE:
    "This repository is no longer available through your GitHub App installation.",
  REPOSITORY_REMOVED:
    "GitHub access to this repository was removed. Choose another repository.",
  DB_ERROR: "Blumo could not save your selection. Please try again.",
};

export function RepositoryList({
  repositories: initialRepositories,
  currentSelectionId,
  syncError,
}: RepositoryListProps) {
  const router = useRouter();
  const [repositories, setRepositories] = useState(initialRepositories);
  const [selectedId, setSelectedId] = useState(currentSelectionId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function retrySync() {
    setRefreshing(true);
    router.refresh();
  }

  async function handleSelect(repository: SyncedRepository) {
    setPendingId(repository.id);
    setSuccessMessage(null);
    setRowErrors((current) => ({ ...current, [repository.id]: "" }));

    const result = await selectRepositoryAction(repository.id);

    if (result.ok) {
      setSelectedId(repository.id);
      setRepositories((current) =>
        current.map((item) => ({
          ...item,
          is_selected: item.id === repository.id,
        }))
      );
      setSuccessMessage(`${repository.full_name} is now your active repository.`);
      setPendingId(null);
      router.refresh();
      return;
    }

    if (result.errorCode === "REPOSITORY_REMOVED") {
      setRepositories((current) =>
        current.map((item) =>
          item.id === repository.id
            ? { ...item, access_status: "removed", is_selected: false }
            : item
        )
      );
      if (selectedId === repository.id) setSelectedId(null);
    }

    if (result.errorCode === "REPOSITORY_NOT_ACCESSIBLE") {
      setRepositories((current) =>
        current.map((item) =>
          item.id === repository.id
            ? { ...item, access_status: "unavailable", is_selected: false }
            : item
        )
      );
      if (selectedId === repository.id) setSelectedId(null);
    }

    setRowErrors((current) => ({
      ...current,
      [repository.id]:
        SELECTION_ERRORS[result.errorCode] ??
        "This repository could not be selected. Please try again.",
    }));
    setPendingId(null);
  }

  if (syncError) {
    const githubUnavailable = syncError === "GITHUB_UNAVAILABLE";

    return (
      <Card className="rounded-xl border" style={{ borderColor: "var(--border-default)" }}>
        <CardContent className="space-y-4 py-4">
          <div
            className="rounded-lg border p-4 text-sm"
            role="alert"
            style={{
              backgroundColor: "var(--state-error-soft)",
              borderColor: "var(--state-error)",
              color: "var(--state-error)",
            }}
          >
            <p className="font-medium">
              {githubUnavailable
                ? "GitHub is temporarily unavailable"
                : "Repositories could not be synchronized"}
            </p>
            <p className="mt-1">
              {githubUnavailable
                ? "Try again in a moment. Your existing repository records have not been changed."
                : "Blumo could not update the repository list. Please try again."}
            </p>
          </div>
          <Button onClick={retrySync} disabled={refreshing} variant="outline">
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Trying again…" : "Try again"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (repositories.length === 0) {
    return (
      <Card className="rounded-xl border" style={{ borderColor: "var(--border-default)" }}>
        <CardContent className="py-10 text-center">
          <GitBranch
            className="mx-auto size-10"
            aria-hidden="true"
            style={{ color: "var(--border-strong)" }}
          />
          <p className="mt-3 font-medium" style={{ color: "var(--text-primary)" }}>
            No accessible repositories
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
            Give the Blumo GitHub App access to at least one repository, then
            return here to synchronize it.
          </p>
          <a
            href="https://github.com/settings/installations"
            className="mt-4 inline-flex text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--accent-strong)" }}
          >
            Manage GitHub App access
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border" style={{ borderColor: "var(--border-default)" }}>
      <CardHeader className="border-b" style={{ borderColor: "var(--border-default)" }}>
        <CardTitle>Select one active repository</CardTitle>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Blumo will use this repository for future approved missions.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        <p className="sr-only" aria-live="polite">
          {successMessage}
        </p>
        {successMessage && (
          <div
            className="rounded-lg border p-3 text-sm"
            role="status"
            style={{
              backgroundColor: "var(--state-success-soft)",
              borderColor: "var(--state-success)",
              color: "var(--state-success)",
            }}
          >
            {successMessage}
          </div>
        )}

        <ul className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
          {repositories.map((repository) => {
            const isSelected = selectedId === repository.id;
            const isActive = repository.access_status === "active";
            const isRemoved = repository.access_status === "removed";
            const isPending = pendingId === repository.id;

            return (
              <li key={repository.id}>
                <div
                  className="rounded-xl border p-4 transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? "var(--accent-soft)"
                      : isActive
                        ? "var(--bg-surface)"
                        : "var(--bg-subtle)",
                    borderColor: isSelected
                      ? "var(--accent-primary)"
                      : "var(--border-default)",
                    opacity: isActive ? 1 : 0.72,
                  }}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className="truncate font-mono text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {repository.full_name}
                        </p>
                        {repository.is_private && (
                          <Badge variant="outline">
                            <LockKeyhole aria-hidden="true" /> Private
                          </Badge>
                        )}
                        {isSelected && (
                          <Badge
                            style={{
                              backgroundColor: "var(--state-success-soft)",
                              color: "var(--state-success)",
                            }}
                          >
                            <Check aria-hidden="true" /> Selected
                          </Badge>
                        )}
                        {!isActive && (
                          <Badge variant="outline">
                            {isRemoved ? "Access removed" : "Unavailable"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        Default branch: {repository.default_branch}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant={isSelected ? "secondary" : "default"}
                      disabled={isSelected || !isActive || pendingId !== null}
                      aria-pressed={isSelected}
                      onClick={() => handleSelect(repository)}
                    >
                      {isPending ? "Selecting…" : isSelected ? "Selected" : "Select"}
                    </Button>
                  </div>

                  {rowErrors[repository.id] && (
                    <p
                      className="mt-3 text-sm"
                      role="alert"
                      style={{ color: "var(--state-error)" }}
                    >
                      {rowErrors[repository.id]}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
          <Link href="/dashboard" style={{ color: "var(--text-secondary)" }}>
            ← Back to dashboard
          </Link>
          <a
            href="https://github.com/settings/installations"
            className="font-medium underline underline-offset-4"
            style={{ color: "var(--accent-strong)" }}
          >
            Change GitHub access
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
