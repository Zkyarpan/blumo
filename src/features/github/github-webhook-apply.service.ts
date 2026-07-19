import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClaimedWebhookDelivery,
  WebhookApplyResult,
} from "@/features/github/github-webhook.types";

const applyRowSchema = z.object({
  apply_result: z.enum(["processed", "ignored"]),
  affected_count: z.number().int().nonnegative(),
});

function firstRpcRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

export async function applyWebhookDelivery(
  client: SupabaseClient,
  input: ClaimedWebhookDelivery
): Promise<WebhookApplyResult> {
  const { payload } = input;
  let rpcResult;
  try {
    rpcResult = await client.rpc("apply_github_webhook_delivery", {
      p_delivery_id: input.deliveryId,
      p_payload_sha256: input.payloadSha256,
      p_claim_version: input.claimVersion,
      p_event_name: input.eventName,
      p_action: payload.action,
      p_installation_id: payload.installationId,
      p_account_id: payload.account?.id ?? null,
      p_account_login: payload.account?.login ?? null,
      p_account_type: payload.account?.type ?? null,
      p_repository_delta: payload.repositoryDelta,
    });
  } catch {
    console.error("[github-webhook] delivery_apply_failed");
    return { ok: false };
  }

  const { data, error } = rpcResult;

  if (error) {
    console.error("[github-webhook] delivery_apply_failed");
    return { ok: false };
  }

  const parsed = applyRowSchema.safeParse(firstRpcRow(data));
  if (!parsed.success) {
    console.error("[github-webhook] invalid_apply_result");
    return { ok: false };
  }

  return {
    ok: true,
    code: parsed.data.apply_result,
    affectedCount: parsed.data.affected_count,
  };
}
