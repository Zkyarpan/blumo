import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SelectRepositoryErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_ONBOARDED"
  | "NO_ACTIVE_INSTALLATION"
  | "REPOSITORY_NOT_FOUND"
  | "REPOSITORY_NOT_ACCESSIBLE"
  | "REPOSITORY_REMOVED"
  | "DB_ERROR";

export type SelectRepositoryResult =
  | { ok: true; repositoryId: string }
  | { ok: false; errorCode: SelectRepositoryErrorCode };

type RepositoryRow = {
  id: string;
  installation_id: string;
  full_name: string;
  default_branch: string;
  access_status: string;
};

/** Selects one owned, active repository and safely clears the prior selection. */
export async function selectRepository(
  repositoryId: string,
  userId: string
): Promise<SelectRepositoryResult> {
  const adminClient = createSupabaseAdminClient();

  const { data: repository, error: repositoryError } = await adminClient
    .from("repositories")
    .select("id, installation_id, full_name, default_branch, access_status")
    .eq("id", repositoryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (repositoryError) {
    console.error("[repository-selection.service] repository query failed");
    return { ok: false, errorCode: "DB_ERROR" };
  }

  if (!repository) {
    return { ok: false, errorCode: "REPOSITORY_NOT_FOUND" };
  }

  const repositoryRow = repository as RepositoryRow;

  if (repositoryRow.access_status === "removed") {
    return { ok: false, errorCode: "REPOSITORY_REMOVED" };
  }

  if (repositoryRow.access_status !== "active") {
    return { ok: false, errorCode: "REPOSITORY_NOT_ACCESSIBLE" };
  }

  const { data: installation, error: installationError } = await adminClient
    .from("github_installations")
    .select("id")
    .eq("id", repositoryRow.installation_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (installationError) {
    console.error("[repository-selection.service] installation query failed");
    return { ok: false, errorCode: "DB_ERROR" };
  }

  if (!installation) {
    return { ok: false, errorCode: "REPOSITORY_NOT_ACCESSIBLE" };
  }

  const { data: previousSelections, error: previousSelectionsError } =
    await adminClient
      .from("repositories")
      .select("id")
      .eq("user_id", userId)
      .eq("is_selected", true);

  if (previousSelectionsError) {
    console.error(
      "[repository-selection.service] previous selection query failed"
    );
    return { ok: false, errorCode: "DB_ERROR" };
  }

  const { error: clearError } = await adminClient
    .from("repositories")
    .update({ is_selected: false })
    .eq("user_id", userId)
    .eq("is_selected", true);

  if (clearError) {
    console.error("[repository-selection.service] selection clear failed");
    return { ok: false, errorCode: "DB_ERROR" };
  }

  const { data: selectedRepository, error: selectError } = await adminClient
    .from("repositories")
    .update({ is_selected: true })
    .eq("id", repositoryId)
    .eq("user_id", userId)
    .eq("access_status", "active")
    .select("id")
    .maybeSingle();

  if (selectError || !selectedRepository) {
    const previousSelectionIds = (previousSelections ?? [])
      .map((row) => row.id)
      .filter(
        (id): id is string =>
          typeof id === "string" &&
          (Boolean(selectError) || id !== repositoryId)
      );

    if (previousSelectionIds.length > 0) {
      await adminClient
        .from("repositories")
        .update({ is_selected: true })
        .eq("user_id", userId)
        .in("id", previousSelectionIds);
    }

    if (selectError) {
      console.error("[repository-selection.service] selection update failed");
      return { ok: false, errorCode: "DB_ERROR" };
    }

    return { ok: false, errorCode: "REPOSITORY_NOT_ACCESSIBLE" };
  }

  const { error: auditError } = await adminClient.from("audit_logs").insert({
    user_id: userId,
    action: "repository_selected",
    resource_type: "repository",
    resource_id: repositoryId,
    metadata: {
      full_name: repositoryRow.full_name,
      default_branch: repositoryRow.default_branch,
    },
  });

  if (auditError) {
    console.error("[repository-selection.service] audit insert failed");
  }

  return { ok: true, repositoryId };
}
