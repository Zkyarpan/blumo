import "server-only";

import { createAppOctokit } from "@/lib/github/app-auth";
import { getInstallationById } from "@/lib/github/installation-lookup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type InstallationErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_ONBOARDED"
  | "MISSING_INSTALLATION_ID"
  | "INVALID_INSTALLATION"
  | "GITHUB_UNAVAILABLE"
  | "OWNERSHIP_MISMATCH"
  | "ORG_NOT_SUPPORTED"
  | "INSTALLATION_CONFLICT"
  | "DB_ERROR";

export type InstallationResult =
  | { ok: true; installationRowId: string }
  | { ok: false; errorCode: InstallationErrorCode };

/**
 * Orchestrates the full GitHub App installation verification and storage flow.
 *
 * Steps:
 * 1. Authenticate as the GitHub App.
 * 2. Retrieve the installation from GitHub API.
 * 3. Verify it's a User installation (not Organization).
 * 4. Verify the installation account matches the signed-in user's GitHub ID.
 * 5. Check for conflicts — same installation_id assigned to a different user.
 * 6. Upsert the verified installation record.
 * 7. Record a sanitized audit event.
 *
 * Uses the admin Supabase client for the upsert and audit insert because
 * these operations require a trusted server boundary after independent
 * GitHub API verification.
 *
 * @param installationId - The numeric GitHub installation ID from the callback.
 * @param userId - The authenticated Blumo user's UUID.
 * @param githubUserId - The authenticated user's GitHub numeric account ID,
 *                       loaded from profiles.github_user_id.
 */
export async function processInstallationCallback(
  installationId: number,
  userId: string,
  githubUserId: number
): Promise<InstallationResult> {
  // Step 1 + 2: Authenticate as the App and retrieve the installation.
  let octokit: ReturnType<typeof createAppOctokit>;
  try {
    octokit = createAppOctokit();
  } catch {
    return { ok: false, errorCode: "GITHUB_UNAVAILABLE" };
  }

  let installation: Awaited<ReturnType<typeof getInstallationById>>;
  try {
    installation = await getInstallationById(octokit, installationId);
  } catch {
    return { ok: false, errorCode: "GITHUB_UNAVAILABLE" };
  }

  if (!installation) {
    return { ok: false, errorCode: "INVALID_INSTALLATION" };
  }

  // Step 3: Reject Organization installations for the MVP.
  if (installation.account.type === "Organization") {
    return { ok: false, errorCode: "ORG_NOT_SUPPORTED" };
  }

  // Step 4: Verify the installation belongs to the signed-in user.
  // Compare numeric GitHub account IDs — logins can be renamed, IDs cannot.
  if (installation.account.id !== githubUserId) {
    return { ok: false, errorCode: "OWNERSHIP_MISMATCH" };
  }

  const adminClient = createSupabaseAdminClient();

  // Step 5: Check for a conflict — same installation_id, different user_id.
  const { data: existing, error: selectError } = await adminClient
    .from("github_installations")
    .select("id, user_id")
    .eq("installation_id", installationId)
    .maybeSingle();

  if (selectError) {
    console.error("[installation.service] conflict check failed:", selectError.message);
    return { ok: false, errorCode: "DB_ERROR" };
  }

  if (existing && existing.user_id !== userId) {
    return { ok: false, errorCode: "INSTALLATION_CONFLICT" };
  }

  // Step 6: Upsert the verified installation record.
  const { data: upserted, error: upsertError } = await adminClient
    .from("github_installations")
    .upsert(
      {
        user_id: userId,
        installation_id: installationId,
        account_id: installation.account.id,
        account_login: installation.account.login,
        account_type: installation.account.type,
        status: "active",
        installed_at: new Date().toISOString(),
      },
      {
        onConflict: "installation_id",
      }
    )
    .select("id")
    .single();

  if (upsertError || !upserted) {
    console.error("[installation.service] upsert failed:", upsertError?.message);
    return { ok: false, errorCode: "DB_ERROR" };
  }

  const installationRowId: string = upserted.id;

  // Step 7: Record a sanitized audit event.
  // Audit failure does not roll back the upsert.
  const { error: auditError } = await adminClient.from("audit_logs").insert({
    user_id: userId,
    action: "github_installation_connected",
    resource_type: "installation",
    resource_id: installationRowId,
    metadata: {
      installation_id: installationId,
      account_login: installation.account.login,
      account_type: installation.account.type,
    },
  });

  if (auditError) {
    console.error("[installation.service] audit insert failed:", auditError.message);
    // Continue — audit failure does not invalidate a successful installation.
  }

  return { ok: true, installationRowId };
}
