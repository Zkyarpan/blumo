import { NextResponse } from "next/server";
import { processGitHubWebhook } from "@/features/github/github-webhook.service";
import { getGitHubAppConfig } from "@/lib/github/github-app.config";
import { parseWebhookPayload } from "@/lib/github/webhook-payload.schema";
import { readWebhookRequest } from "@/lib/github/webhook-request";
import {
  hashWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/github/webhook-signature";

export const runtime = "nodejs";

const REQUEST_ERROR_STATUS = {
  invalid_headers: 400,
  invalid_signature: 401,
  payload_too_large: 413,
  unsupported_media_type: 415,
} as const;

const PROCESS_STATUS = {
  processed: 200,
  duplicate: 200,
  ignored: 200,
  processing: 202,
  delivery_conflict: 409,
  temporarily_unavailable: 503,
} as const;

function jsonCode(code: string, status: number) {
  return NextResponse.json({ code }, { status });
}

export async function POST(request: Request) {
  let requestResult;
  try {
    requestResult = await readWebhookRequest(request);
  } catch {
    return jsonCode("temporarily_unavailable", 503);
  }
  if (!requestResult.ok) {
    return jsonCode(
      requestResult.errorCode,
      REQUEST_ERROR_STATUS[requestResult.errorCode]
    );
  }

  let webhookSecret: string;
  try {
    webhookSecret = getGitHubAppConfig().webhookSecret;
  } catch {
    return jsonCode("temporarily_unavailable", 503);
  }

  if (
    !verifyWebhookSignature(
      requestResult.rawBody,
      requestResult.headers.signature,
      webhookSecret
    )
  ) {
    return jsonCode("invalid_signature", 401);
  }

  let untrustedPayload: unknown;
  try {
    const bodyText = new TextDecoder("utf-8", { fatal: true }).decode(
      requestResult.rawBody
    );
    untrustedPayload = JSON.parse(bodyText) as unknown;
  } catch {
    return jsonCode("invalid_payload", 400);
  }

  const payloadResult = parseWebhookPayload(
    requestResult.headers.eventName,
    untrustedPayload
  );
  if (!payloadResult.ok) return jsonCode("invalid_payload", 400);

  let result;
  try {
    result = await processGitHubWebhook({
      deliveryId: requestResult.headers.deliveryId,
      eventName: requestResult.headers.eventName,
      payloadSha256: hashWebhookPayload(requestResult.rawBody),
      payload: payloadResult.payload,
    });
  } catch {
    return jsonCode("temporarily_unavailable", 503);
  }

  return jsonCode(result.code, PROCESS_STATUS[result.code]);
}
