import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseWebhookPayload } from "@/lib/github/webhook-payload.schema";

const installation = {
  id: 12345,
  account: { id: 99, login: "owner", type: "User" },
};

describe("parseWebhookPayload", () => {
  it("validates an installation lifecycle payload", () => {
    const result = parseWebhookPayload("installation", {
      action: "suspend",
      installation,
      ignored_field: "safe to ignore",
    });
    expect(result).toEqual({
      ok: true,
      payload: {
        kind: "installation",
        action: "suspend",
        installationId: 12345,
        account: installation.account,
        repositoryDelta: null,
      },
    });
  });

  it("normalizes only allowlisted added repository metadata", () => {
    const result = parseWebhookPayload("installation_repositories", {
      action: "added",
      installation,
      repositories_added: [
        {
          id: 101,
          name: "alpha",
          full_name: "owner/alpha",
          private: true,
          default_branch: "develop",
          owner: installation.account,
          secret_like_extra: "not retained",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.repositoryDelta).toEqual([
        {
          id: 101,
          name: "alpha",
          full_name: "owner/alpha",
          default_branch: "develop",
          is_private: true,
          owner_id: 99,
          owner_login: "owner",
          owner_type: "User",
        },
      ]);
      expect(JSON.stringify(result.payload)).not.toContain("secret_like_extra");
    }
  });

  it("normalizes removed repositories to stable IDs only", () => {
    const result = parseWebhookPayload("installation_repositories", {
      action: "removed",
      installation,
      repositories_removed: [{ id: 101, name: "mutable-name" }],
    });
    expect(result.ok && result.payload.repositoryDelta).toEqual([{ id: 101 }]);
  });

  it("rejects invalid installation identity and repository fields", () => {
    expect(
      parseWebhookPayload("installation", {
        action: "deleted",
        installation: { ...installation, account: { ...installation.account, type: "Organization" } },
      })
    ).toEqual({ ok: false });

    expect(
      parseWebhookPayload("installation_repositories", {
        action: "added",
        installation,
        repositories_added: [{ id: 101 }],
      })
    ).toEqual({ ok: false });
  });

  it("allows an unknown supported-event action but does not inspect delta arrays", () => {
    const result = parseWebhookPayload("installation_repositories", {
      action: "future_action",
      installation,
      repositories_added: "untrusted ignored field",
    });
    expect(result.ok && result.payload.action).toBe("future_action");
    expect(result.ok && result.payload.repositoryDelta).toBeNull();
  });

  it("ignores an unsupported event without reading payload fields", () => {
    expect(parseWebhookPayload("push", { token: "not retained" })).toEqual({
      ok: true,
      payload: {
        kind: "unsupported",
        action: null,
        installationId: null,
        account: null,
        repositoryDelta: null,
      },
    });
  });
});
