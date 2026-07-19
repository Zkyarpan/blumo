import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { applyWebhookDelivery } from "@/features/github/github-webhook-apply.service";
import type { ClaimedWebhookDelivery } from "@/features/github/github-webhook.types";

const BASE: Omit<ClaimedWebhookDelivery, "payload"> = {
  deliveryId: "123e4567-e89b-12d3-a456-426614174000",
  eventName: "installation_repositories",
  payloadSha256: "b".repeat(64),
  claimVersion: 1,
};

function clientWithRpc(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient;
}

describe("applyWebhookDelivery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("passes only normalized repository metadata to the transactional RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ apply_result: "processed", affected_count: 1 }],
      error: null,
    });
    const repositoryDelta = [
      {
        id: 101,
        name: "alpha",
        full_name: "owner/alpha",
        default_branch: "develop",
        is_private: true,
        owner_id: 99,
        owner_login: "owner",
        owner_type: "User" as const,
      },
    ];

    const result = await applyWebhookDelivery(clientWithRpc(rpc), {
      ...BASE,
      payload: {
        kind: "installation_repositories",
        action: "added",
        installationId: 12345,
        account: { id: 99, login: "owner", type: "User" },
        repositoryDelta,
      },
    });

    expect(result).toEqual({ ok: true, code: "processed", affectedCount: 1 });
    expect(rpc).toHaveBeenCalledWith(
      "apply_github_webhook_delivery",
      expect.objectContaining({
        p_delivery_id: BASE.deliveryId,
        p_claim_version: 1,
        p_account_id: 99,
        p_repository_delta: repositoryDelta,
      })
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("token");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("signature");
  });

  it("returns ignored for an unmatched or unsupported verified delivery", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ apply_result: "ignored", affected_count: 0 }],
      error: null,
    });
    const result = await applyWebhookDelivery(clientWithRpc(rpc), {
      ...BASE,
      eventName: "push",
      payload: {
        kind: "unsupported",
        action: null,
        installationId: null,
        account: null,
        repositoryDelta: null,
      },
    });
    expect(result).toEqual({ ok: true, code: "ignored", affectedCount: 0 });
  });

  it("returns a safe failure without exposing database error text", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "database-secret-details" },
    });
    const result = await applyWebhookDelivery(clientWithRpc(rpc), {
      ...BASE,
      eventName: "installation",
      payload: {
        kind: "installation",
        action: "deleted",
        installationId: 12345,
        account: { id: 99, login: "owner", type: "User" },
        repositoryDelta: null,
      },
    });
    expect(result).toEqual({ ok: false });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("database-secret-details");
  });
});
