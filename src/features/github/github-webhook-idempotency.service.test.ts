import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  claimWebhookDelivery,
  failWebhookDelivery,
} from "@/features/github/github-webhook-idempotency.service";
import type { WebhookDeliveryInput } from "@/features/github/github-webhook.types";

const INPUT: WebhookDeliveryInput = {
  deliveryId: "123e4567-e89b-12d3-a456-426614174000",
  eventName: "installation",
  payloadSha256: "a".repeat(64),
  payload: {
    kind: "installation",
    action: "suspend",
    installationId: 12345,
    account: { id: 99, login: "owner", type: "User" },
    repositoryDelta: null,
  },
};

function clientWithRpc(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient;
}

describe("webhook delivery idempotency", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each(["claimed", "reclaimed"] as const)(
    "returns a claim version for %s deliveries",
    async (state) => {
      const rpc = vi.fn().mockResolvedValue({
        data: [{ claim_result: state, claim_version: 2 }],
        error: null,
      });

      await expect(claimWebhookDelivery(clientWithRpc(rpc), INPUT)).resolves.toEqual({
        ok: true,
        state,
        claimVersion: 2,
      });
      expect(rpc).toHaveBeenCalledWith("claim_github_webhook_delivery", {
        p_delivery_id: INPUT.deliveryId,
        p_event_name: "installation",
        p_action: "suspend",
        p_payload_sha256: INPUT.payloadSha256,
        p_installation_id: 12345,
      });
    }
  );

  it.each(["duplicate", "in_progress", "conflict"] as const)(
    "returns the non-owner %s state without a claim version",
    async (state) => {
      const rpc = vi.fn().mockResolvedValue({
        data: [{ claim_result: state, claim_version: null }],
        error: null,
      });
      await expect(claimWebhookDelivery(clientWithRpc(rpc), INPUT)).resolves.toEqual({
        ok: true,
        state,
      });
    }
  );

  it("handles two concurrent duplicate claim results safely", async () => {
    let call = 0;
    const rpc = vi.fn().mockImplementation(async () => {
      call += 1;
      return call === 1
        ? { data: [{ claim_result: "claimed", claim_version: 1 }], error: null }
        : { data: [{ claim_result: "in_progress", claim_version: null }], error: null };
    });
    const client = clientWithRpc(rpc);

    const results = await Promise.all([
      claimWebhookDelivery(client, INPUT),
      claimWebhookDelivery(client, INPUT),
    ]);
    expect(results).toEqual([
      { ok: true, state: "claimed", claimVersion: 1 },
      { ok: true, state: "in_progress" },
    ]);
  });

  it("returns a safe failure for database errors or malformed RPC results", async () => {
    const errorClient = clientWithRpc(
      vi.fn().mockResolvedValue({ data: null, error: { message: "secret db text" } })
    );
    await expect(claimWebhookDelivery(errorClient, INPUT)).resolves.toEqual({ ok: false });

    const malformedClient = clientWithRpc(
      vi.fn().mockResolvedValue({ data: [{ unexpected: true }], error: null })
    );
    await expect(claimWebhookDelivery(malformedClient, INPUT)).resolves.toEqual({ ok: false });
  });

  it("fails only the matching claim version using a fixed safe error code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await failWebhookDelivery(
      clientWithRpc(rpc),
      { ...INPUT, claimVersion: 3 },
      "webhook_apply_failed"
    );
    expect(rpc).toHaveBeenCalledWith("fail_github_webhook_delivery", {
      p_delivery_id: INPUT.deliveryId,
      p_claim_version: 3,
      p_error_code: "webhook_apply_failed",
    });
  });
});
