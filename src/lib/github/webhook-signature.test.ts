import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  hashWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/github/webhook-signature";

function sign(body: Uint8Array, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("GitHub webhook signatures", () => {
  it("accepts GitHub's documented HMAC fixture", () => {
    const body = new TextEncoder().encode("Hello, World!");
    expect(
      verifyWebhookSignature(
        body,
        "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
        "It's a Secret to Everybody"
      )
    ).toBe(true);
  });

  it("accepts a signature over the exact raw bytes", () => {
    const body = new TextEncoder().encode('{"action":"created"}');
    expect(verifyWebhookSignature(body, sign(body, "secret"), "secret")).toBe(true);
  });

  it("rejects a missing or malformed signature", () => {
    const body = new Uint8Array();
    expect(verifyWebhookSignature(body, "", "secret")).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abc", "secret")).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zz", "secret")).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=aa", "secret")).toBe(false);
  });

  it("rejects a payload modified by one byte", () => {
    const original = new TextEncoder().encode("payload");
    const modified = new TextEncoder().encode("payloae");
    expect(verifyWebhookSignature(modified, sign(original, "secret"), "secret")).toBe(false);
  });

  it("does not normalize JSON whitespace or property order", () => {
    const original = new TextEncoder().encode('{"a":1,"b":2}');
    const reordered = new TextEncoder().encode('{ "b": 2, "a": 1 }');
    expect(verifyWebhookSignature(reordered, sign(original, "secret"), "secret")).toBe(false);
  });

  it("rejects unequal digest lengths without throwing", () => {
    expect(() =>
      verifyWebhookSignature(new Uint8Array(), "sha256=abcd", "secret")
    ).not.toThrow();
  });

  it("does not log secrets, signatures, or raw bodies on failure", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const body = new TextEncoder().encode("sensitive-body");
    verifyWebhookSignature(body, `sha256=${"0".repeat(64)}`, "sensitive-secret");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns a stable lowercase SHA-256 payload digest", () => {
    expect(hashWebhookPayload(new TextEncoder().encode("payload"))).toMatch(
      /^[0-9a-f]{64}$/
    );
  });
});
