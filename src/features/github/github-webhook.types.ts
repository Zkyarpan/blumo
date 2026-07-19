import type { NormalizedWebhookPayload } from "@/lib/github/webhook-payload.schema";

export type WebhookDeliveryInput = {
  deliveryId: string;
  eventName: string;
  payloadSha256: string;
  payload: NormalizedWebhookPayload;
};

export type ClaimedWebhookDelivery = WebhookDeliveryInput & {
  claimVersion: number;
};

export type WebhookProcessResult =
  | { code: "processed" | "duplicate" | "ignored" }
  | { code: "processing" }
  | { code: "delivery_conflict" }
  | { code: "temporarily_unavailable" };

export type WebhookApplyResult =
  | { ok: true; code: "processed" | "ignored"; affectedCount: number }
  | { ok: false };
