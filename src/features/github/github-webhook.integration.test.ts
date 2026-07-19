import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { processGitHubWebhook } from "@/features/github/github-webhook.service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WebhookDeliveryInput } from "@/features/github/github-webhook.types";

const BASE: WebhookDeliveryInput = {
  deliveryId: "123e4567-e89b-12d3-a456-426614174000",
  eventName: "installation",
  payloadSha256: "c".repeat(64),
  payload: {
    kind: "installation",
    action: "suspend",
    installationId: 12345,
    account: { id: 99, login: "owner", type: "User" },
    repositoryDelta: null,
  },
};

describe("GitHub webhook orchestration integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("claims, applies, audits through the transaction RPC, and completes a delivery", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ claim_result: "claimed", claim_version: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ apply_result: "processed", affected_count: 2 }],
        error: null,
      });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as never);

    await expect(processGitHubWebhook(BASE)).resolves.toEqual({ code: "processed" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_github_webhook_delivery",
      "apply_github_webhook_delivery",
    ]);
  });

  it("does not reapply a duplicate delivery", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ claim_result: "duplicate", claim_version: null }],
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as never);

    await expect(processGitHubWebhook(BASE)).resolves.toEqual({ code: "duplicate" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns processing for a concurrent fresh claim without mutation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ claim_result: "in_progress", claim_version: null }],
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as never);
    await expect(processGitHubWebhook(BASE)).resolves.toEqual({ code: "processing" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects a reused delivery ID with conflicting verified data", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ claim_result: "conflict", claim_version: null }],
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as never);
    await expect(processGitHubWebhook(BASE)).resolves.toEqual({
      code: "delivery_conflict",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("marks the owned claim failed when the transactional apply call fails", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ claim_result: "claimed", claim_version: 4 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "apply failed" } })
      .mockResolvedValueOnce({ data: true, error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as never);

    await expect(processGitHubWebhook(BASE)).resolves.toEqual({
      code: "temporarily_unavailable",
    });
    expect(rpc).toHaveBeenLastCalledWith("fail_github_webhook_delivery", {
      p_delivery_id: BASE.deliveryId,
      p_claim_version: 4,
      p_error_code: "webhook_apply_failed",
    });
  });

  it.each([
    ["created", "installation"],
    ["deleted", "installation"],
    ["suspend", "installation"],
    ["unsuspend", "installation"],
    ["new_permissions_accepted", "installation"],
    ["added", "installation_repositories"],
    ["removed", "installation_repositories"],
  ] as const)("dispatches %s through the atomic lifecycle boundary", async (action, kind) => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ claim_result: "claimed", claim_version: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ apply_result: "processed", affected_count: 1 }],
        error: null,
      });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as never);

    const repositoryEvent = kind === "installation_repositories";
    const input: WebhookDeliveryInput = {
      ...BASE,
      eventName: kind,
      payload: repositoryEvent
        ? {
            kind: "installation_repositories",
            action,
            installationId: 12345,
            account: { id: 99, login: "owner", type: "User" },
            repositoryDelta: action === "removed" ? [{ id: 101 }] : [],
          }
        : {
            kind: "installation",
            action,
            installationId: 12345,
            account: { id: 99, login: "owner", type: "User" },
            repositoryDelta: null,
          },
    };

    await expect(processGitHubWebhook(input)).resolves.toEqual({ code: "processed" });
    expect(rpc).toHaveBeenLastCalledWith(
      "apply_github_webhook_delivery",
      expect.objectContaining({ p_action: action, p_event_name: kind })
    );
  });
});
