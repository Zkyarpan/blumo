import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClaimedWebhookDelivery,
  WebhookDeliveryInput,
} from "@/features/github/github-webhook.types";

const claimRowSchema = z.object({
  claim_result: z.enum([
    "claimed",
    "duplicate",
    "in_progress",
    "reclaimed",
    "conflict",
  ]),
  claim_version: z.number().int().positive().nullable(),
});

export type WebhookClaimResult =
  | { ok: true; state: "claimed" | "reclaimed"; claimVersion: number }
  | { ok: true; state: "duplicate" | "in_progress" | "conflict" }
  | { ok: false };

function firstRpcRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

export async function claimWebhookDelivery(
  client: SupabaseClient,
  input: WebhookDeliveryInput
): Promise<WebhookClaimResult> {
  let rpcResult;
  try {
    rpcResult = await client.rpc("claim_github_webhook_delivery", {
      p_delivery_id: input.deliveryId,
      p_event_name: input.eventName,
      p_action: input.payload.action,
      p_payload_sha256: input.payloadSha256,
      p_installation_id: input.payload.installationId,
    });
  } catch {
    console.error("[github-webhook] delivery_claim_failed");
    return { ok: false };
  }

  const { data, error } = rpcResult;

  if (error) {
    console.error("[github-webhook] delivery_claim_failed");
    return { ok: false };
  }

  const parsed = claimRowSchema.safeParse(firstRpcRow(data));
  if (!parsed.success) {
    console.error("[github-webhook] invalid_claim_result");
    return { ok: false };
  }

  if (
    parsed.data.claim_result === "claimed" ||
    parsed.data.claim_result === "reclaimed"
  ) {
    if (parsed.data.claim_version === null) {
      console.error("[github-webhook] missing_claim_version");
      return { ok: false };
    }

    return {
      ok: true,
      state: parsed.data.claim_result,
      claimVersion: parsed.data.claim_version,
    };
  }

  return { ok: true, state: parsed.data.claim_result };
}

export async function failWebhookDelivery(
  client: SupabaseClient,
  input: ClaimedWebhookDelivery,
  errorCode: "webhook_apply_failed"
): Promise<void> {
  let rpcResult;
  try {
    rpcResult = await client.rpc("fail_github_webhook_delivery", {
      p_delivery_id: input.deliveryId,
      p_claim_version: input.claimVersion,
      p_error_code: errorCode,
    });
  } catch {
    console.error("[github-webhook] delivery_failure_record_failed");
    return;
  }

  if (rpcResult.error) {
    console.error("[github-webhook] delivery_failure_record_failed");
  }
}
