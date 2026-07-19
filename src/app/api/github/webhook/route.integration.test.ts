import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/github/github-app.config", () => ({
  getGitHubAppConfig: vi.fn(() => ({ webhookSecret: "route-test-secret" })),
}));
vi.mock("@/features/github/github-webhook.service", () => ({
  processGitHubWebhook: vi.fn(),
}));

import { processGitHubWebhook } from "@/features/github/github-webhook.service";
import { POST } from "@/app/api/github/webhook/route";

const DELIVERY_ID = "123e4567-e89b-12d3-a456-426614174000";
const SECRET = "route-test-secret";
const PAYLOAD = JSON.stringify({
  action: "deleted",
  installation: {
    id: 12345,
    account: { id: 99, login: "owner", type: "User" },
  },
});

function signature(body: string) {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

function webhookRequest(
  body: string,
  options: { signature?: string | null; event?: string; delivery?: string } = {}
) {
  const headers = new Headers({
    "content-type": "application/json",
    "x-github-event": options.event ?? "installation",
    "x-github-delivery": options.delivery ?? DELIVERY_ID,
  });
  if (options.signature !== null) {
    headers.set("x-hub-signature-256", options.signature ?? signature(body));
  }
  return new Request("http://localhost/api/github/webhook", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/github/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(processGitHubWebhook).mockResolvedValue({ code: "processed" });
  });

  it("accepts a valid signature and passes normalized data to the service", async () => {
    const response = await POST(webhookRequest(PAYLOAD));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ code: "processed" });
    expect(processGitHubWebhook).toHaveBeenCalledWith({
      deliveryId: DELIVERY_ID,
      eventName: "installation",
      payloadSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      payload: {
        kind: "installation",
        action: "deleted",
        installationId: 12345,
        account: { id: 99, login: "owner", type: "User" },
        repositoryDelta: null,
      },
    });
  });

  it("rejects an invalid, missing, or modified signature before service access", async () => {
    const invalid = await POST(
      webhookRequest(PAYLOAD, { signature: `sha256=${"0".repeat(64)}` })
    );
    const missing = await POST(webhookRequest(PAYLOAD, { signature: null }));
    const modified = await POST(
      webhookRequest(`${PAYLOAD} `, { signature: signature(PAYLOAD) })
    );

    expect(invalid.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(modified.status).toBe(401);
    expect(processGitHubWebhook).not.toHaveBeenCalled();
  });

  it("parses JSON only after a valid signature and rejects malformed JSON safely", async () => {
    const response = await POST(webhookRequest("{"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "invalid_payload" });
    expect(processGitHubWebhook).not.toHaveBeenCalled();
  });

  it("rejects invalid fields for supported events", async () => {
    const body = JSON.stringify({ action: "deleted", installation: { id: -1 } });
    const response = await POST(webhookRequest(body));
    expect(response.status).toBe(400);
    expect(processGitHubWebhook).not.toHaveBeenCalled();
  });

  it("safely acknowledges an unknown event after verification and claiming", async () => {
    vi.mocked(processGitHubWebhook).mockResolvedValue({ code: "ignored" });
    const body = JSON.stringify({ sensitive_untrusted_field: "not retained" });
    const response = await POST(webhookRequest(body, { event: "push" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ code: "ignored" });
    expect(processGitHubWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "push",
        payload: {
          kind: "unsupported",
          action: null,
          installationId: null,
          account: null,
          repositoryDelta: null,
        },
      })
    );
    expect(JSON.stringify(vi.mocked(processGitHubWebhook).mock.calls)).not.toContain(
      "sensitive_untrusted_field"
    );
  });

  it.each([
    ["duplicate", 200],
    ["ignored", 200],
    ["processing", 202],
    ["delivery_conflict", 409],
    ["temporarily_unavailable", 503],
  ] as const)("maps %s to a safe response", async (code, status) => {
    vi.mocked(processGitHubWebhook).mockResolvedValue({ code });
    const response = await POST(webhookRequest(PAYLOAD));
    expect(response.status).toBe(status);
    const responseBody = JSON.stringify(await response.json());
    expect(responseBody).not.toContain(PAYLOAD);
    expect(responseBody).not.toContain(SECRET);
  });
});
