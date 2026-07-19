import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

export function verifyWebhookSignature(
  rawBody: Uint8Array,
  receivedSignature: string,
  secret: string
): boolean {
  const match = SIGNATURE_PATTERN.exec(receivedSignature);
  if (!match || secret.length === 0) return false;

  const receivedDigest = Buffer.from(match[1], "hex");
  const expectedDigest = createHmac("sha256", secret).update(rawBody).digest();

  if (receivedDigest.length !== expectedDigest.length) return false;
  return timingSafeEqual(receivedDigest, expectedDigest);
}

export function hashWebhookPayload(rawBody: Uint8Array): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
