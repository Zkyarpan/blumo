import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyWebhookDelivery } from "@/features/github/github-webhook-apply.service";
import type {
  ClaimedWebhookDelivery,
  WebhookApplyResult,
} from "@/features/github/github-webhook.types";

export async function processInstallationLifecycle(
  client: SupabaseClient,
  input: ClaimedWebhookDelivery
): Promise<WebhookApplyResult> {
  if (input.payload.kind !== "installation") return { ok: false };
  return applyWebhookDelivery(client, input);
}
