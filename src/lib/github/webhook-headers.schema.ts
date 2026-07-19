import { z } from "zod";

const contentTypeSchema = z
  .string()
  .max(200)
  .regex(/^application\/json(?:\s*;[^,\r\n]+)?$/i);

const signatureSchema = z
  .string()
  .regex(/^sha256=[0-9a-f]{64}$/i);

const eventSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_]+$/);

const deliverySchema = z
  .string()
  .max(100)
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const webhookHeadersSchema = z.object({
  contentType: contentTypeSchema,
  signature: signatureSchema,
  eventName: eventSchema,
  deliveryId: deliverySchema,
});

export type WebhookHeaders = z.infer<typeof webhookHeadersSchema>;

export type WebhookHeaderError =
  | "unsupported_media_type"
  | "invalid_signature"
  | "invalid_headers";

export type WebhookHeadersResult =
  | { ok: true; headers: WebhookHeaders }
  | { ok: false; errorCode: WebhookHeaderError };

export function parseWebhookHeaders(headers: Headers): WebhookHeadersResult {
  const contentType = headers.get("content-type");
  if (!contentTypeSchema.safeParse(contentType).success) {
    return { ok: false, errorCode: "unsupported_media_type" };
  }

  const signature = headers.get("x-hub-signature-256");
  if (!signatureSchema.safeParse(signature).success) {
    return { ok: false, errorCode: "invalid_signature" };
  }

  const eventName = headers.get("x-github-event");
  const deliveryId = headers.get("x-github-delivery");
  const parsed = webhookHeadersSchema.safeParse({
    contentType,
    signature,
    eventName,
    deliveryId,
  });

  if (!parsed.success) {
    return { ok: false, errorCode: "invalid_headers" };
  }

  return {
    ok: true,
    headers: {
      ...parsed.data,
      signature: parsed.data.signature.toLowerCase(),
      deliveryId: parsed.data.deliveryId.toLowerCase(),
    },
  };
}
