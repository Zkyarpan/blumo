import { describe, expect, it } from "vitest";
import {
  MAX_GITHUB_WEBHOOK_BYTES,
  readWebhookRequest,
} from "@/lib/github/webhook-request";

const DELIVERY_ID = "123e4567-e89b-12d3-a456-426614174000";

function validHeaders(overrides: Record<string, string> = {}) {
  return {
    "content-type": "application/json; charset=utf-8",
    "x-hub-signature-256": `sha256=${"a".repeat(64)}`,
    "x-github-event": "installation",
    "x-github-delivery": DELIVERY_ID,
    ...overrides,
  };
}

describe("readWebhookRequest", () => {
  it("reads the raw body once with validated headers", async () => {
    const result = await readWebhookRequest(
      new Request("http://localhost/api/github/webhook", {
        method: "POST",
        headers: validHeaders(),
        body: '{"ok":true}',
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new TextDecoder().decode(result.rawBody)).toBe('{"ok":true}');
      expect(result.headers.deliveryId).toBe(DELIVERY_ID);
    }
  });

  it("rejects non-JSON content types", async () => {
    const result = await readWebhookRequest(
      new Request("http://localhost/api/github/webhook", {
        method: "POST",
        headers: validHeaders({ "content-type": "text/plain" }),
        body: "payload",
      })
    );
    expect(result).toEqual({ ok: false, errorCode: "unsupported_media_type" });
  });

  it("rejects missing and malformed signature headers", async () => {
    const missing = validHeaders();
    delete (missing as Partial<typeof missing>)["x-hub-signature-256"];

    await expect(
      readWebhookRequest(
        new Request("http://localhost/api/github/webhook", {
          method: "POST",
          headers: missing,
          body: "{}",
        })
      )
    ).resolves.toEqual({ ok: false, errorCode: "invalid_signature" });

    await expect(
      readWebhookRequest(
        new Request("http://localhost/api/github/webhook", {
          method: "POST",
          headers: validHeaders({ "x-hub-signature-256": "sha1=bad" }),
          body: "{}",
        })
      )
    ).resolves.toEqual({ ok: false, errorCode: "invalid_signature" });
  });

  it("rejects missing or invalid event and delivery headers", async () => {
    const result = await readWebhookRequest(
      new Request("http://localhost/api/github/webhook", {
        method: "POST",
        headers: validHeaders({ "x-github-delivery": "not-a-guid" }),
        body: "{}",
      })
    );
    expect(result).toEqual({ ok: false, errorCode: "invalid_headers" });
  });

  it("rejects a declared body larger than one MiB without reading it", async () => {
    const result = await readWebhookRequest(
      new Request("http://localhost/api/github/webhook", {
        method: "POST",
        headers: validHeaders({
          "content-length": String(MAX_GITHUB_WEBHOOK_BYTES + 1),
        }),
        body: "{}",
      })
    );
    expect(result).toEqual({ ok: false, errorCode: "payload_too_large" });
  });

  it("rejects streamed bytes larger than one MiB", async () => {
    const body = new Uint8Array(MAX_GITHUB_WEBHOOK_BYTES + 1);
    const result = await readWebhookRequest(
      new Request("http://localhost/api/github/webhook", {
        method: "POST",
        headers: validHeaders(),
        body,
      })
    );
    expect(result).toEqual({ ok: false, errorCode: "payload_too_large" });
  });
});
