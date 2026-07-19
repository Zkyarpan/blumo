import "server-only";

import { applyWebhookDelivery } from "@/features/github/github-webhook-apply.service";
import {
  claimWebhookDelivery,
  failWebhookDelivery,
} from "@/features/github/github-webhook-idempotency.service";
import type {
  ClaimedWebhookDelivery,
  WebhookDeliveryInput,
  WebhookProcessResult,
} from "@/features/github/github-webhook.types";
import { processInstallationLifecycle } from "@/features/github/installation-lifecycle.service";
import { processInstallationRepositoriesLifecycle } from "@/features/github/installation-repositories-lifecycle.service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function processGitHubWebhook(
  input: WebhookDeliveryInput
): Promise<WebhookProcessResult> {
  let client;
  try {
    client = createSupabaseAdminClient();
  } catch {
    console.error("[github-webhook] admin_client_unavailable");
    return { code: "temporarily_unavailable" };
  }
  const claim = await claimWebhookDelivery(client, input);

  if (!claim.ok) return { code: "temporarily_unavailable" };
  if (claim.state === "duplicate") return { code: "duplicate" };
  if (claim.state === "in_progress") return { code: "processing" };
  if (claim.state === "conflict") {
    console.error("[github-webhook] delivery_conflict", input.deliveryId);
    return { code: "delivery_conflict" };
  }

  if (!("claimVersion" in claim)) {
    return { code: "temporarily_unavailable" };
  }

  const claimedInput: ClaimedWebhookDelivery = {
    ...input,
    claimVersion: claim.claimVersion,
  };

  let applyResult;
  if (input.payload.kind === "installation") {
    applyResult = await processInstallationLifecycle(client, claimedInput);
  } else if (input.payload.kind === "installation_repositories") {
    applyResult = await processInstallationRepositoriesLifecycle(
      client,
      claimedInput
    );
  } else {
    applyResult = await applyWebhookDelivery(client, claimedInput);
  }

  if (!applyResult.ok) {
    await failWebhookDelivery(client, claimedInput, "webhook_apply_failed");
    return { code: "temporarily_unavailable" };
  }

  return { code: applyResult.code };
}
