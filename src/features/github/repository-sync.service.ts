import "server-only";

import { createInstallationToken } from "@/lib/github/installation-token";
import { listInstallationRepositories } from "@/lib/github/repository-list";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RepositorySyncErrorCode =
  | "NO_ACTIVE_INSTALLATION"
  | "INSTALLATION_SUSPENDED"
  | "GITHUB_UNAVAILABLE"
  | "TOKEN_FAILED"
  | "DB_ERROR";

export type SyncedRepository = {
  id: string;
  github_repository_id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  is_private: boolean;
  is_selected: boolean;
  access_status: string;
};

export type RepositorySyncResult =
  | { ok: true; repositories: SyncedRepository[] }
  | { ok: false; errorCode: RepositorySyncErrorCode };

type InstallationRow = {
  id: string;
  installation_id: number;
  status: string;
};

async function findInstallation(
  userId: string,
  status: "active" | "suspended"
): Promise<{ data: InstallationRow | null; error: unknown }> {
  const adminClient = createSupabaseAdminClient();
  const result = await adminClient
    .from("github_installations")
    .select("id, installation_id, status")
    .eq("user_id", userId)
    .eq("status", status)
    .maybeSingle();

  return result as { data: InstallationRow | null; error: unknown };
}

/**
 * Synchronizes repository metadata for the user's verified active installation.
 * Installation tokens stay inside this server-only call chain and are discarded
 * after the GitHub list operation finishes.
 */
export async function syncRepositories(
  userId: string
): Promise<RepositorySyncResult> {
  const activeInstallationResult = await findInstallation(userId, "active");

  if (activeInstallationResult.error) {
    console.error("[repository-sync.service] active installation query failed");
    return { ok: false, errorCode: "DB_ERROR" };
  }

  const installation = activeInstallationResult.data;

  if (!installation) {
    const suspendedInstallationResult = await findInstallation(
      userId,
      "suspended"
    );

    if (suspendedInstallationResult.error) {
      console.error(
        "[repository-sync.service] suspended installation query failed"
      );
      return { ok: false, errorCode: "DB_ERROR" };
    }

    return {
      ok: false,
      errorCode: suspendedInstallationResult.data
        ? "INSTALLATION_SUSPENDED"
        : "NO_ACTIVE_INSTALLATION",
    };
  }

  const tokenResult = await createInstallationToken(
    installation.installation_id
  );

  if (!tokenResult.ok) {
    return {
      ok: false,
      errorCode:
        tokenResult.errorCode === "INVALID_INSTALLATION"
          ? "NO_ACTIVE_INSTALLATION"
          : "GITHUB_UNAVAILABLE",
    };
  }

  const repositoryListResult = await listInstallationRepositories(
    tokenResult.token,
    installation.installation_id
  );

  if (!repositoryListResult.ok) {
    return { ok: false, errorCode: "GITHUB_UNAVAILABLE" };
  }

  const adminClient = createSupabaseAdminClient();
  const syncedAt = new Date().toISOString();
  const repositories = repositoryListResult.repositories;

  if (repositories.length > 0) {
    const rows = repositories.map((repository) => ({
      user_id: userId,
      installation_id: installation.id,
      github_repository_id: repository.id,
      owner: repository.owner.login,
      name: repository.name,
      full_name: repository.full_name,
      default_branch: repository.default_branch,
      is_private: repository.private,
      access_status: "active",
      last_synced_at: syncedAt,
    }));

    const { error: upsertError } = await adminClient
      .from("repositories")
      .upsert(rows, { onConflict: "user_id,github_repository_id" });

    if (upsertError) {
      console.error("[repository-sync.service] repository upsert failed");
      return { ok: false, errorCode: "DB_ERROR" };
    }
  }

  const { data: activeRows, error: activeRowsError } = await adminClient
    .from("repositories")
    .select("id, github_repository_id")
    .eq("user_id", userId)
    .eq("installation_id", installation.id)
    .eq("access_status", "active");

  if (activeRowsError) {
    console.error("[repository-sync.service] active repository query failed");
    return { ok: false, errorCode: "DB_ERROR" };
  }

  const returnedIds = new Set(repositories.map((repository) => repository.id));
  const removedRowIds = (activeRows ?? [])
    .filter((row) => !returnedIds.has(row.github_repository_id))
    .map((row) => row.id);

  if (removedRowIds.length > 0) {
    const { error: removedUpdateError } = await adminClient
      .from("repositories")
      .update({ access_status: "removed", is_selected: false })
      .eq("user_id", userId)
      .eq("installation_id", installation.id)
      .in("id", removedRowIds);

    if (removedUpdateError) {
      console.error("[repository-sync.service] removed repository update failed");
      return { ok: false, errorCode: "DB_ERROR" };
    }
  }

  const { error: auditError } = await adminClient.from("audit_logs").insert({
    user_id: userId,
    action: "repositories_synced",
    resource_type: "installation",
    resource_id: installation.id,
    metadata: {
      repository_count: repositories.length,
      removed_count: removedRowIds.length,
    },
  });

  if (auditError) {
    console.error("[repository-sync.service] audit insert failed");
  }

  const { data: syncedRows, error: syncedRowsError } = await adminClient
    .from("repositories")
    .select(
      "id, github_repository_id, owner, name, full_name, default_branch, is_private, is_selected, access_status"
    )
    .eq("user_id", userId)
    .eq("installation_id", installation.id)
    .order("full_name", { ascending: true });

  if (syncedRowsError) {
    console.error("[repository-sync.service] synced repository query failed");
    return { ok: false, errorCode: "DB_ERROR" };
  }

  return {
    ok: true,
    repositories: (syncedRows ?? []) as SyncedRepository[],
  };
}
