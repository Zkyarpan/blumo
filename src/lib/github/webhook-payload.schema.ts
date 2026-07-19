import "server-only";

import { z } from "zod";

const safePositiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const actionSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_]+$/);

const accountSchema = z
  .object({
    id: safePositiveInteger,
    login: z.string().trim().min(1),
    type: z.literal("User"),
  })
  .passthrough();

const installationSchema = z
  .object({
    id: safePositiveInteger,
    account: accountSchema,
  })
  .passthrough();

const sharedPayloadSchema = z
  .object({
    action: actionSchema,
    installation: installationSchema,
  })
  .passthrough();

const addedRepositorySchema = z
  .object({
    id: safePositiveInteger,
    name: z.string().trim().min(1),
    full_name: z.string().trim().min(1),
    private: z.boolean(),
    default_branch: z.string().trim().min(1),
    owner: accountSchema,
  })
  .passthrough();

const removedRepositorySchema = z
  .object({
    id: safePositiveInteger,
  })
  .passthrough();

const addedPayloadSchema = sharedPayloadSchema.extend({
  action: z.literal("added"),
  repositories_added: z.array(addedRepositorySchema),
});

const removedPayloadSchema = sharedPayloadSchema.extend({
  action: z.literal("removed"),
  repositories_removed: z.array(removedRepositorySchema),
});

export type WebhookAccount = {
  id: number;
  login: string;
  type: "User";
};

export type NormalizedAddedRepository = {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  is_private: boolean;
  owner_id: number;
  owner_login: string;
  owner_type: "User";
};

export type NormalizedRemovedRepository = { id: number };

type SupportedWebhookPayload = {
  kind: "installation" | "installation_repositories";
  action: string;
  installationId: number;
  account: WebhookAccount;
  repositoryDelta:
    | NormalizedAddedRepository[]
    | NormalizedRemovedRepository[]
    | null;
};

type UnsupportedWebhookPayload = {
  kind: "unsupported";
  action: null;
  installationId: null;
  account: null;
  repositoryDelta: null;
};

export type NormalizedWebhookPayload =
  | SupportedWebhookPayload
  | UnsupportedWebhookPayload;

export type WebhookPayloadResult =
  | { ok: true; payload: NormalizedWebhookPayload }
  | { ok: false };

export function parseWebhookPayload(
  eventName: string,
  input: unknown
): WebhookPayloadResult {
  if (eventName !== "installation" && eventName !== "installation_repositories") {
    return {
      ok: true,
      payload: {
        kind: "unsupported",
        action: null,
        installationId: null,
        account: null,
        repositoryDelta: null,
      },
    };
  }

  const sharedResult = sharedPayloadSchema.safeParse(input);
  if (!sharedResult.success) return { ok: false };

  const shared = sharedResult.data;
  const base = {
    action: shared.action,
    installationId: shared.installation.id,
    account: shared.installation.account,
  };

  if (eventName === "installation") {
    return {
      ok: true,
      payload: { kind: "installation", ...base, repositoryDelta: null },
    };
  }

  if (shared.action === "added") {
    const addedResult = addedPayloadSchema.safeParse(input);
    if (!addedResult.success) return { ok: false };

    return {
      ok: true,
      payload: {
        kind: "installation_repositories",
        ...base,
        repositoryDelta: addedResult.data.repositories_added.map((repository) => ({
          id: repository.id,
          name: repository.name,
          full_name: repository.full_name,
          default_branch: repository.default_branch,
          is_private: repository.private,
          owner_id: repository.owner.id,
          owner_login: repository.owner.login,
          owner_type: repository.owner.type,
        })),
      },
    };
  }

  if (shared.action === "removed") {
    const removedResult = removedPayloadSchema.safeParse(input);
    if (!removedResult.success) return { ok: false };

    return {
      ok: true,
      payload: {
        kind: "installation_repositories",
        ...base,
        repositoryDelta: removedResult.data.repositories_removed.map(
          (repository) => ({ id: repository.id })
        ),
      },
    };
  }

  return {
    ok: true,
    payload: {
      kind: "installation_repositories",
      ...base,
      repositoryDelta: null,
    },
  };
}
