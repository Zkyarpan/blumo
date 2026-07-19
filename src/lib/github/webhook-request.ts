import { parseWebhookHeaders } from "@/lib/github/webhook-headers.schema";
import type {
  WebhookHeaderError,
  WebhookHeaders,
} from "@/lib/github/webhook-headers.schema";

export const MAX_GITHUB_WEBHOOK_BYTES = 1_048_576;

export type WebhookRequestError = WebhookHeaderError | "payload_too_large";

export type WebhookRequestResult =
  | { ok: true; headers: WebhookHeaders; rawBody: Uint8Array }
  | { ok: false; errorCode: WebhookRequestError };

export async function readWebhookRequest(
  request: Request
): Promise<WebhookRequestResult> {
  const headerResult = parseWebhookHeaders(request.headers);
  if (!headerResult.ok) return headerResult;

  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength > MAX_GITHUB_WEBHOOK_BYTES) {
      return { ok: false, errorCode: "payload_too_large" };
    }
  }

  if (!request.body) {
    return { ok: true, headers: headerResult.headers, rawBody: new Uint8Array() };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_GITHUB_WEBHOOK_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, errorCode: "payload_too_large" };
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const rawBody = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    rawBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, headers: headerResult.headers, rawBody };
}
