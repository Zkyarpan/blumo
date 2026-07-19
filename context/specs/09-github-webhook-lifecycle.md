# Unit 09: GitHub App Webhook Lifecycle

## Goal

Keep the verified GitHub App installation and repository access stored by Blumo in
sync with GitHub after installation settings change.

Unit 09 adds one server-only GitHub App webhook endpoint. It authenticates every
delivery against the exact raw request body, processes only the installation
lifecycle events required by the MVP, makes each delivery idempotent, preserves
repository history, and updates the existing GitHub connection UI when access is
suspended, restored, removed, or uninstalled.

At the end of Unit 09, a signed-in user does not need to revisit Blumo for GitHub
installation changes to take effect. GitHub is the caller of the webhook; the
endpoint does not use browser authentication and does not perform GitHub API calls.

---

## Dependencies

- Unit 08 is complete, manually verified, and merged into `main`.
- A verified installation is stored in `github_installations` and is associated
  with a Blumo user by the authenticated Unit 07 setup callback.
- Repository metadata and the user's one active selection are stored in
  `repositories` by Unit 08.
- `audit_logs` exists and is writable only through trusted server paths.
- Supabase service-role access remains server-only.
- The GitHub App setup described in `docs/github-app-setup.md` is available for
  local and deployed manual verification.

---

## GitHub Contract

The implementation must follow GitHub's current webhook contract:

- GitHub signs the exact request payload with HMAC-SHA-256 and sends the result in
  `X-Hub-Signature-256` with a `sha256=` prefix.
- `X-GitHub-Event` identifies the event type.
- `X-GitHub-Delivery` is the delivery GUID and remains the same for redelivery.
- GitHub expects a successful `2xx` response within ten seconds.
- GitHub limits webhook payloads to 25 MB. Blumo applies the smaller application
  limit defined in this specification.

Authoritative references:

- [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- [Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

GitHub's actual `installation` action values are `created`, `deleted`, `suspend`,
`unsuspend`, and `new_permissions_accepted`. The words `suspended` and
`unsuspended` describe Blumo states in prose; they are not accepted GitHub action
strings.

---

## Scope

### Included

- One unauthenticated-by-browser, signature-authenticated webhook route:
  `POST /api/github/webhook`.
- Exact raw-body HMAC-SHA-256 validation using `GITHUB_WEBHOOK_SECRET`.
- Required request-header, content-type, and payload-size validation.
- Delivery-level idempotency and concurrent-delivery protection using
  `X-GitHub-Delivery`.
- `installation` event processing for:
  - `created`
  - `deleted`
  - `suspend`
  - `unsuspend`
  - `new_permissions_accepted`
- `installation_repositories` event processing for:
  - `added`
  - `removed`
- Lifecycle updates to `github_installations` and `repositories`.
- Automatic removal of a selected repository when it is no longer usable.
- Sanitized audit records with at most one lifecycle audit record per delivery.
- Dashboard and repository-management states for suspended and uninstalled
  installations and repositories made unavailable by webhooks.
- Database migration and automated tests required by this specification.
- GitHub App configuration and setup-guide updates required to receive the events.

### Explicitly Excluded

- Any GitHub event other than `installation` and `installation_repositories`.
- GitHub webhook event replay UI or operator dashboard.
- GitHub webhook processing for repository pushes, pull requests, issues, checks,
  deployments, releases, memberships, or organization changes.
- Repository content reads.
- Generating GitHub installation access tokens.
- Calling the GitHub REST or GraphQL API from the webhook path.
- Organization installation support; the MVP continues to support personal
  `User` installations only.
- Branch creation or modification.
- File creation, update, or deletion.
- GitHub commits or pull requests.
- AI, Pollinations, mission generation, Resend, scheduling, or payments.
- Unit 10 or later functionality.

---

## Endpoint Contract

### Route

Create:

```text
src/app/api/github/webhook/route.ts
```

The public endpoint is exactly:

```text
POST /api/github/webhook
```

The route must export `runtime = "nodejs"` because verification uses Node's
`crypto` module. It must not export a `GET`, browser page, Server Action, or a
general-purpose webhook handler.

The route is intentionally outside the authenticated `(app)` route group. It must
not read or require a Supabase browser session, cookie, CSRF token, or GitHub OAuth
identity. The caller is authenticated only by the GitHub webhook signature.

### Required Headers

Headers are case-insensitive. The route requires:

| Header | Validation | Use |
| --- | --- | --- |
| `Content-Type` | Media type must be `application/json`; parameters such as `charset=utf-8` are allowed | Reject non-JSON bodies before processing |
| `X-Hub-Signature-256` | Exactly `sha256=` followed by 64 hexadecimal characters | Authenticate the exact raw body |
| `X-GitHub-Event` | Non-empty ASCII event name, maximum 100 characters | Route only supported events |
| `X-GitHub-Delivery` | Valid UUID/GUID text, maximum 100 characters | Idempotency key and sanitized correlation ID |

`X-GitHub-Hook-ID` and `User-Agent` may be present but are not trusted and do not
participate in authorization.

### Request Size Limit

Blumo accepts at most **1,048,576 bytes (1 MiB)** for this lifecycle endpoint.
Installation and repository-selection lifecycle payloads are metadata-only and do
not require GitHub's full 25 MB maximum.

- If a valid numeric `Content-Length` is greater than 1 MiB, return `413` without
  reading the body.
- If `Content-Length` is absent, invalid, or smaller than the bytes actually sent,
  enforce the same limit while reading the request stream.
- Read at most 1 MiB plus one byte, cancel further reading, and return `413` when
  the limit is exceeded.
- Do not call `request.json()` or `request.text()` before verification.

### Raw Body and Verification Order

The processing order is mandatory:

1. Validate `Content-Type` and the required header presence and shape.
2. Enforce the request-size limit while reading the body exactly once as bytes.
3. Compute HMAC-SHA-256 over those exact bytes using `GITHUB_WEBHOOK_SECRET`.
4. Decode the hexadecimal digest from the signature header.
5. Reject unequal digest lengths before comparison.
6. Compare the received and computed digest bytes with
   `crypto.timingSafeEqual`.
7. Only after a successful comparison, decode the body as UTF-8 and parse JSON.
8. Validate the event-specific payload schema.
9. Hash the verified raw bytes with SHA-256 for delivery conflict detection.
10. Claim the delivery in the database before making lifecycle changes.

No parsed payload field may be read, logged, returned, or used in a database query
before step 6 succeeds. Plain string equality and timing-variable digest
comparison are prohibited.

### Response Contract

The response body is a small fixed JSON object. It must never contain a request
payload, stack trace, database error, webhook secret, private key, installation
token, or user data.

| Status | Code | Meaning |
| --- | --- | --- |
| `200` | `processed` | Supported delivery completed |
| `200` | `duplicate` | This delivery completed or was ignored previously |
| `200` | `ignored` | Signature was valid, but the event/action or installation is intentionally outside scope |
| `202` | `processing` | Another request currently owns a fresh claim for the same delivery |
| `400` | `invalid_headers` | Event or delivery header is missing or malformed |
| `400` | `invalid_payload` | Verified body is not valid JSON or fails the supported event schema |
| `401` | `invalid_signature` | Signature is missing, malformed, or does not match |
| `409` | `delivery_conflict` | A known delivery ID is presented with different event data or payload digest |
| `413` | `payload_too_large` | Body exceeds 1 MiB |
| `415` | `unsupported_media_type` | Content type is not JSON |
| `503` | `temporarily_unavailable` | A database or transient processing failure should be retried |

Do not disclose whether an installation ID, account ID, user, or repository exists
in the response. A valid but unsupported event/action is acknowledged with `200`
so GitHub does not retry functionality Blumo intentionally ignores.

The handler should normally finish far below GitHub's ten-second timeout. There is
no network call to GitHub in this unit.

---

## Payload Validation

Define narrow Zod schemas in a server-only module. Use `.passthrough()` at GitHub
object boundaries so harmless new fields do not break deliveries, but require all
fields Blumo uses.

### Shared Fields

Every supported payload must contain:

```text
action: non-empty string
installation.id: positive safe integer
installation.account.id: positive safe integer
installation.account.login: non-empty string
installation.account.type: exactly "User"
```

Reject supported-event payloads if a required used field is missing, has the wrong
type, exceeds JavaScript's safe integer range, or identifies a non-`User`
installation. Organization support is not inferred.

### Repository Fields

Each entry that is processed from `repositories_added` requires:

```text
id: positive safe integer
name: non-empty string
full_name: non-empty string
private: boolean
default_branch: non-empty string
owner.id: positive safe integer
owner.login: non-empty string
owner.type: exactly "User"
```

Each entry processed from `repositories_removed` requires at minimum a positive
safe-integer `id`. Validate optional identifying metadata when it is present, but
perform removal by the verified stored installation and GitHub repository ID, not
by mutable names.

Unknown top-level fields are ignored after verification. The full payload is never
persisted.

---

## Installation Ownership Boundary

A valid webhook proves that GitHub sent the event to the Blumo GitHub App. It does
not prove which Blumo user owns an installation. User association must come only
from the verified row created by Unit 07.

For every supported delivery:

1. Find `github_installations` by numeric `installation_id` from the payload.
2. Require the row's `account_id` to equal `installation.account.id`.
3. Require the row's `account_login` to match the payload login
   case-insensitively and its `account_type` to be `User`.
4. Treat the stored row's `user_id` as the sole owner for all downstream writes.
5. Scope every repository update to both that installation row's UUID and its
   `user_id`.

The webhook must never accept `user_id` from a payload, query string, header, or
cookie.

If no verified row exists, or the stored account identity does not match:

- Make no installation or repository change.
- Complete the delivery as `ignored`.
- Write a sanitized audit record only if there is a safe existing user association
  to own it; otherwise rely on the delivery ledger without inventing a `user_id`.
- Return the generic `200 { "code": "ignored" }` response.

In particular, an `installation.created` delivery **must not create a user-owned
installation row**. The authenticated Unit 07 setup callback remains the only
operation that associates a GitHub installation with a Blumo user.

---

## Lifecycle Behaviour

All timestamps in this section use one server-generated UTC transaction timestamp.
Lifecycle updates must be set-based and safe to repeat.

### `installation.created`

For an existing verified installation whose installation ID and account identity
match:

- Set `status = 'active'`.
- Set `suspended_at = null`.
- Set `uninstalled_at = null`.
- Refresh `account_login` only with the verified payload value.
- Do not create, delete, restore, select, or synchronize repository rows.
- Record audit action `github_installation_created`.

If no verified row exists, ignore the delivery as described in the ownership
boundary. Repository synchronization still happens only through the authenticated
Unit 08 flow.

### `installation.suspend`

GitHub sends the action string `suspend`.

- Set the installation `status = 'suspended'`.
- Set `suspended_at` to the transaction timestamp.
- Set `uninstalled_at = null`.
- Change repositories for that user and installation where
  `access_status = 'active'` to `access_status = 'unavailable'`.
- Set `is_selected = false` for every repository owned by that user and
  installation, including already removed/unavailable rows.
- Preserve repository rows and all historical task/commit relationships.
- Record audit action `github_installation_suspended` with only affected row
  counts and the installation's internal UUID.

No GitHub operation may remain enabled for a suspended installation.

### `installation.unsuspend`

GitHub sends the action string `unsuspend`.

- Set the installation `status = 'active'`.
- Set `suspended_at = null`.
- Set `uninstalled_at = null`.
- Change repositories for that user and installation where
  `access_status = 'unavailable'` to `access_status = 'active'`.
- Leave `access_status = 'removed'` unchanged; explicit repository removal is not
  reversed by an installation unsuspension.
- Do not restore any prior selection. The user must select an active repository
  again.
- Record audit action `github_installation_unsuspended` with sanitized counts.

The next authenticated repository synchronization remains authoritative and may
mark repositories active or removed based on the current GitHub API response.

### `installation.deleted`

- Set the installation `status = 'uninstalled'`.
- Set `uninstalled_at` to the transaction timestamp.
- Set `suspended_at = null`.
- Change repositories for that user and installation where `access_status` is
  `active` or `unavailable` to `access_status = 'unavailable'`.
- Set `is_selected = false` for every repository for that user and installation.
- Preserve the installation row, repository rows, and all history.
- Record audit action `github_installation_deleted` with sanitized counts.

An uninstalled row cannot authorize repository use. Reconnection must pass through
the authenticated setup callback and Unit 08 synchronization again.

### `installation.new_permissions_accepted`

- Verify the installation and account identity normally.
- Do not change installation status, repository status, or selection.
- Do not treat acceptance as reconnection, unsuspension, or repository sync.
- Record audit action `github_installation_permissions_accepted`.

This event is an audit/lifecycle acknowledgement only. Blumo does not broaden its
GitHub permissions in Unit 09.

### Unknown `installation` Action

After signature validation, schema validation of shared fields, and delivery
claiming:

- Do not mutate installation or repository state.
- Complete the delivery with status `ignored`.
- Record `github_webhook_ignored` for a matched verified installation, containing
  only the event name and sanitized action string.
- Return `200 { "code": "ignored" }`.

---

## Repository Access Events

### `installation_repositories.added`

The event must include `repositories_added` as an array. An empty array is valid
and produces no repository mutation.

For each valid entry:

1. Require `repository.owner.id` to equal the verified installation's
   `account_id`; this preserves the personal-installation MVP boundary.
2. Upsert by the existing database identity used in Unit 08:
   `(user_id, github_repository_id)`.
3. Set:
   - `user_id` to the verified installation owner.
   - `installation_id` to the internal UUID of that verified installation row.
   - `github_repository_id` to `repository.id`.
   - `owner` to `repository.owner.login`.
   - `name` to `repository.name`.
   - `full_name` to `repository.full_name`.
   - `default_branch` to `repository.default_branch`.
   - `is_private` to `repository.private`.
   - `last_synced_at` to the transaction timestamp.
   - `access_status` to `active` only when the verified installation status is
     currently `active`; otherwise set it to `unavailable`.
4. Preserve the existing row's `is_selected` value. A newly inserted row starts
   unselected. A conflict update may retain `true` only if the installation is
   active and the row remains active; otherwise force `false`.
5. Never move an existing repository row owned by another user or another
   installation. Treat that mismatch as a processing failure for investigation,
   without exposing identity details in the response.

Do not infer that repositories omitted from `repositories_added` were removed.
This event is a delta, not a complete installation repository list.

Record one audit action `github_repositories_added` for the delivery with only the
added count and affected count. Do not write one audit row per repository.

### `installation_repositories.removed`

The event must include `repositories_removed` as an array. An empty array is valid
and produces no repository mutation.

For each valid GitHub repository ID, update only rows satisfying all of:

```text
repositories.user_id = verified installation user_id
repositories.installation_id = verified installation internal UUID
repositories.github_repository_id = payload repository id
```

For matching rows:

- Set `access_status = 'removed'`.
- Set `is_selected = false`.
- Set `last_synced_at` to the transaction timestamp.
- Preserve the row and all historical relationships.

A repository marked `removed` is unavailable for every Blumo action. It is not
deleted and must not be described as active merely because the installation itself
is active. Removing the selected repository always clears selection.

An unknown repository ID is an idempotent no-op. Record one audit action
`github_repositories_removed` with only the received and affected counts.

### Unknown `installation_repositories` Action

Apply the same signed-and-ignored behavior as an unknown `installation` action.
Do not inspect or mutate repository arrays for an unsupported action.

---

## Database Migration

Create:

```text
supabase/migrations/20240001000012_github_webhook_lifecycle.sql
```

If that timestamp is already occupied when implementation begins, stop and select
the next unused ordered timestamp. Never edit or replace an applied migration.

### Delivery Ledger

Create `public.github_webhook_deliveries` with:

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key, `gen_random_uuid()` |
| `delivery_id` | `text` | Not null, unique |
| `event_name` | `text` | Not null |
| `action` | `text` | Nullable; sanitized action only |
| `payload_sha256` | `text` | Not null, exactly 64 lowercase hex characters |
| `installation_id` | `bigint` | Nullable GitHub installation ID; not a user-ownership source |
| `status` | `text` | Not null; check in `processing`, `completed`, `ignored`, `failed` |
| `attempt_count` | `integer` | Not null, default 1, greater than zero |
| `claimed_at` | `timestamptz` | Not null, default `now()` |
| `processed_at` | `timestamptz` | Nullable |
| `last_error_code` | `text` | Nullable sanitized internal code; no messages or payloads |
| `created_at` | `timestamptz` | Not null, default `now()` |
| `updated_at` | `timestamptz` | Not null, default `now()` |

Enable RLS. Add no authenticated-user policies. Revoke table privileges from
`anon` and `authenticated`; only the service role may use the ledger.

The table stores no raw body, signature, secret, installation token, user ID,
repository name, or GitHub account login.

### Audit Delivery Key

Add nullable `github_delivery_id text` to `audit_logs` and create a unique partial
index:

```sql
create unique index audit_logs_github_delivery_id_idx
  on public.audit_logs (github_delivery_id)
  where github_delivery_id is not null;
```

Existing non-webhook audit rows remain unchanged. The delivery GUID is safe
correlation metadata, not authentication data.

### Atomic Claim Function

Add a narrowly scoped SQL function named `claim_github_webhook_delivery` that:

- Accepts the delivery ID, event name, sanitized action, payload digest, and
  nullable numeric installation ID.
- Executes in one database transaction and locks the matching ledger row.
- Is `security definer`, sets a fixed `search_path`, validates inputs again, and
  revokes execution from `public`, `anon`, and `authenticated`.
- Is executable only by `service_role`.
- Returns exactly one of:
  - `claimed` — a new row was inserted; return its `attempt_count` as the claim
    version.
  - `duplicate` — the matching row is already `completed` or `ignored`.
  - `in_progress` — the matching row is `processing` and its claim is less than
    five minutes old.
  - `reclaimed` — the row was `failed`, or `processing` with a claim at least five
    minutes old; atomically set it to `processing`, increment attempts, clear its
    error, refresh `claimed_at`, and return the new attempt count as the claim
    version.
  - `conflict` — the delivery ID exists but its event name, payload digest, or
    installation ID does not match.

Concurrent inserts must be resolved by the unique constraint and row lock, not by
a read-then-insert race. The service must treat `claimed` and `reclaimed` as the
only states allowed to mutate lifecycle data. The claim result contains no claim
version for any other outcome.

### Completion and Failure

- Mark a delivery `completed` only after its lifecycle update and audit insert
  have succeeded and only when its `attempt_count` still equals the caller's claim
  version.
- Mark an intentionally unsupported/unmatched delivery `ignored`.
- Set `processed_at` for `completed` and `ignored`.
- On a database/transient processing exception, set `status = 'failed'` and a
  fixed `last_error_code` only when the claim version still matches, then return
  `503` so the delivery can be redelivered.
- Never save exception text in the ledger.

The lifecycle database changes, the one audit insert, and the final delivery
status should be executed atomically in a transaction/RPC for each supported
delivery. This prevents a crash after state mutation from leaving a misleading
unfinished claim. Retried operations must still use idempotent `SET`/upsert
semantics, and the unique audit delivery index is a second defense against
duplicate audit rows.

### Atomic Apply Function

The migration must add a narrowly scoped function named
`apply_github_webhook_delivery`. It receives only already-validated, allowlisted
values:

```text
delivery ID
payload SHA-256 digest
claim version (`attempt_count` returned by the claim function)
event name
action
GitHub installation ID
GitHub account ID, login, and type
normalized repository delta JSON (or null)
```

The repository delta JSON contains only the repository fields listed in Payload
Validation; it is not the raw GitHub payload.

In one transaction the function must:

1. Lock and require the matching delivery-ledger row to be `processing` with the
   same claim version, event, action, installation ID, and payload digest already
   recorded by the claim function.
2. Lock and match the stored installation ID and account identity.
3. Apply exactly one lifecycle transition or safely choose `ignored`.
4. Insert the single sanitized audit row with `github_delivery_id`, when there is
   a verified user-owned installation.
5. Set the delivery row to `completed` or `ignored` and set `processed_at`.
6. Return only a typed result, fixed action code, and integer affected counts.

It must be `security definer`, set a fixed `search_path`, revalidate enum/action
inputs and normalized repository fields, and be executable only by `service_role`.
Revoke execution from `public`, `anon`, and `authenticated`. Any failure rolls back
the lifecycle update, audit insert, and completion together.

---

## Idempotency and Concurrency

The `X-GitHub-Delivery` GUID is the idempotency key. Do not substitute an event
timestamp, installation ID, action, or payload hash.

Required behavior:

1. Verify the signature before looking up or claiming the delivery.
2. Compute `payload_sha256` over the same verified raw bytes.
3. Claim the delivery atomically.
4. Return `200 duplicate` without further mutation for `duplicate`.
5. Return `202 processing` without mutation for a fresh `in_progress` claim.
6. Return `409 delivery_conflict` without mutation for `conflict`; also emit a
   sanitized server log containing only the delivery ID and fixed error code.
7. Process `claimed` or `reclaimed` exactly once through the transactional
   lifecycle function.

Two simultaneous requests with the same valid delivery must not create duplicate
audit rows or race installation/repository state. A failed or crashed claim is
retriable; it does not permanently block the GitHub delivery.

Different delivery IDs may describe later GitHub state changes and may execute
concurrently. Each database mutation must scope by the verified installation and
use conditional state changes. The final state should follow the transaction order
accepted by PostgreSQL. Unit 09 does not invent event timestamps or reorder valid
GitHub deliveries.

---

## Audit Rules

Write at most one `audit_logs` row per verified claimed delivery when a matched
user-owned installation exists.

Set:

- `user_id` from the verified stored installation.
- `action` to one of the fixed action names in this specification.
- `resource_type = 'github_installation'` for installation events or
  `resource_type = 'repository_access'` for repository delta events.
- `resource_id` to the verified installation row's internal UUID.
- `github_delivery_id` to the validated delivery GUID.
- `metadata` only to an allowlisted object containing event name, action, and
  integer received/affected counts as relevant.

Never include:

- The raw or parsed payload.
- Request headers or signature.
- Webhook secret, App private key, OAuth secret, service-role key, or installation
  token.
- GitHub email, browser cookies, access tokens, stack traces, or database errors.
- Repository objects or account objects.

Server logs follow the same restrictions. Fixed error codes, delivery ID, event
name, action, and numeric counts are sufficient for diagnosis.

---

## Server Modules

Use this module boundary unless an equivalent split is justified in the
implementation PR without changing behavior:

```text
src/app/api/github/webhook/route.ts
src/lib/github/webhook-signature.ts
src/lib/github/webhook-headers.schema.ts
src/lib/github/webhook-payload.schema.ts
src/lib/github/webhook-request.ts
src/features/github/github-webhook-idempotency.service.ts
src/features/github/installation-lifecycle.service.ts
src/features/github/installation-repositories-lifecycle.service.ts
src/features/github/github-webhook.service.ts
src/features/github/github-webhook.types.ts
```

### `webhook-headers.schema.ts`

- Define and normalize the content type, signature, event, and delivery header
  contract.
- Reject missing, duplicated/ambiguous, malformed, or oversized values with typed
  fixed error codes.
- Have no crypto, database, provider, or UI dependency.

### `webhook-request.ts`

- Validate content type and header formats.
- Read the request body once with the 1 MiB limit.
- Return raw bytes and normalized header values.
- Have no database dependency.

### `webhook-signature.ts`

- Import `server-only`.
- Use Node `createHmac` and `timingSafeEqual`.
- Accept raw bytes, received signature, and webhook secret.
- Return only a boolean or typed fixed result.
- Never log inputs.

### `webhook-payload.schema.ts`

- Contain the narrow shared, installation, and repository-delta Zod schemas.
- Export discriminated parsed types used by the service.
- Have no UI or database dependency.

### `github-webhook-idempotency.service.ts`

- Import `server-only`.
- Wrap the atomic delivery-claim function and typed claim outcomes.
- Complete or fail only the claim currently owned by the request.
- Have no installation/repository mutation or UI responsibility.

### `installation-lifecycle.service.ts`

- Import `server-only`.
- Match a verified stored installation and apply only the five installation action
  transitions defined above.
- Use the transactional database boundary for installation, repository, audit, and
  delivery-completion writes.
- Have no request parsing, signature, GitHub API, or UI responsibility.

### `installation-repositories-lifecycle.service.ts`

- Import `server-only`.
- Match the verified installation and apply only the added/removed repository
  deltas defined above.
- Scope every write by verified user, installation UUID, and numeric GitHub
  repository ID.
- Have no request parsing, signature, GitHub API, or UI responsibility.

### `github-webhook.service.ts`

- Import `server-only`.
- Orchestrate the idempotency and appropriate lifecycle service after successful
  signature verification and schema parsing by the route.
- Use only the Supabase admin client; provider logic remains independent of UI.
- Map database/transient failures to fixed internal result codes.
- Never instantiate Octokit or generate an installation token.

### `route.ts`

- Coordinate request validation, raw signature verification, JSON parsing, schema
  selection, and the service call.
- Map typed outcomes to the exact safe response contract.
- Contain no lifecycle SQL or ownership logic.

---

## Environment and GitHub App Configuration

### Environment Variable

`GITHUB_WEBHOOK_SECRET` becomes required in Unit 09.

Update `src/lib/env/server.ts` so it is a non-empty server-only string. Update
`src/lib/github/github-app.config.ts` so `webhookSecret` is no longer optional.
Update environment validation and GitHub config tests accordingly.

The secret must:

- Be generated as a high-entropy random value.
- Be configured both in the GitHub App and server environment.
- Never use a `NEXT_PUBLIC_` prefix.
- Never be exposed in client bundles, props, logs, responses, audit metadata, or
  test snapshots.

### GitHub App Settings

Update `docs/github-app-setup.md` during implementation with:

1. Webhook URL: the deployed HTTPS origin plus `/api/github/webhook`. For local
   manual testing, use an approved HTTPS forwarding service such as Smee and never
   publish the secret.
2. Webhook secret: the same value as server `GITHUB_WEBHOOK_SECRET`.
3. Webhook active: enabled.
4. Receive and test the GitHub App lifecycle events `installation` and
   `installation_repositories`.

GitHub documents these as default GitHub App events rather than ordinary optional
subscriptions. The setup guide should say to ensure they are being delivered and
must not ask for unrelated event subscriptions or broader repository permissions.

---

## UI Impact

Unit 09 does not add a webhook UI. It updates the existing server-rendered
dashboard and repository-management behavior to reflect stored lifecycle state.

### Dashboard GitHub Card

The dashboard data service must return the current installation state rather than
only a `hasActiveInstallation` boolean.

- Active installation with active selected repository: show the selected
  repository and default branch as in Unit 08.
- Active installation without a selection: show connected state and the existing
  **Manage repositories** link.
- Suspended installation: show a warning that GitHub access is suspended, no
  selected repository, and a link to manage/review the GitHub App installation.
- Uninstalled installation or no verified installation: show disconnected state
  and the existing reconnect path at `/github/connect`.
- Never show a selected repository unless both installation status and repository
  access status are `active`.

### Repository Management Page

- Active installation: retain Unit 08 behavior.
- Suspended installation: do not call GitHub synchronization; show an actionable
  suspended warning and GitHub App settings link. Selection controls are disabled.
- Uninstalled installation: show disconnected/reconnect state and no selection
  controls.
- Repository changed to `removed` by webhook: show it only in the existing
  historical removed/unavailable section, clearly unavailable and unselectable.
- Repository changed to `unavailable` by installation lifecycle: show it as
  unavailable and unselectable.
- After `unsuspend`, eligible repositories are active but remain unselected; ask
  the user to choose one again.
- Loading and GitHub-unavailable/error states from Unit 08 remain intact.

All UI data must come from the user's RLS-scoped authenticated queries. The browser
never reads the delivery ledger, audit delivery key, webhook payload, or secret.

---

## Security Rules

- Treat the raw request bytes as untrusted until HMAC verification succeeds.
- Verify with constant-time digest comparison before JSON parsing or payload use.
- Require the exact `X-Hub-Signature-256` scheme; do not accept legacy
  `X-Hub-Signature` SHA-1 values.
- Keep `GITHUB_WEBHOOK_SECRET` and Supabase service-role credentials server-only.
- Do not generate, store, return, or log GitHub installation tokens.
- Do not use browser authentication or trust browser cookies at the webhook route.
- Do not use payload-supplied user IDs or repository names for authorization.
- Verify the stored installation ID and account identity before user-owned writes.
- Scope repository writes by verified `user_id`, internal `installation_id`, and
  numeric GitHub repository ID.
- Enforce the 1 MiB request limit before allocating or parsing a larger payload.
- Persist only allowlisted lifecycle fields and sanitized audit metadata.
- Enable RLS on the delivery ledger and expose no user policies.
- A signature-valid delivery is not permission to broaden GitHub scopes, read
  repository content, or perform repository writes.

---

## Automated Tests

Use Vitest. Mock crypto inputs deterministically and mock the Supabase/database
boundary; tests must not require a live GitHub App or hosted Supabase project.

### Signature Tests

1. Accept GitHub's documented HMAC-SHA-256 fixture.
2. Accept a valid signature calculated over exact raw bytes.
3. Reject a missing signature.
4. Reject a malformed prefix, non-hex digest, or incorrect digest length.
5. Reject a signature generated for a body that differs by one byte.
6. Prove JSON whitespace/order changes are not normalized before verification.
7. Exercise unequal digest lengths without calling `timingSafeEqual` unsafely.
8. Verify no secret, signature, or raw body is logged on failure.

### Request and Route Tests

9. Reject missing/malformed event and delivery headers.
10. Reject non-JSON content type with `415`.
11. Reject declared and streamed bodies larger than 1 MiB with `413`.
12. Reject malformed JSON only after a valid signature.
13. Reject a supported event with invalid required payload fields.
14. A signature failure never invokes payload parsing or the database service.
15. Unknown event and unknown action return safe `200 ignored` after verification.
16. Route responses never contain payload, secret, stack trace, or database text.

### Idempotency and Concurrency Tests

17. First valid delivery is claimed, processed, audited once, and completed.
18. Redelivery with the same delivery ID and digest returns `duplicate` and does
    not repeat state changes or audit insertion.
19. Two concurrent claims for the same delivery yield one owner and one
    `in_progress`/duplicate result.
20. A delivery ID reused with a different digest/event/installation returns
    `delivery_conflict` and makes no lifecycle change.
21. A failed claim and a processing claim older than five minutes can be reclaimed
    with incremented attempt count.
22. A fresh processing claim cannot be stolen.

### Installation Lifecycle Tests

23. A matching `created` event reactivates only an existing verified installation.
24. `created` with no stored verified installation does not create or associate a
    user row.
25. `deleted` marks the installation uninstalled, marks its repositories
    unavailable, clears selection, and preserves rows.
26. `suspend` marks the installation suspended, disables active repositories, and
    clears the selected repository.
27. `unsuspend` restores only `unavailable` repositories to active and restores no
    selection.
28. `unsuspend` does not restore repositories whose status is `removed`.
29. `new_permissions_accepted` records an audit result without changing access.
30. Installation/account mismatch is ignored and cannot affect another user.

### Repository Delta Tests

31. `added` upserts all required repository metadata for the verified owner and
    installation.
32. `added` under a suspended/uninstalled installation stores the repository as
    unavailable and unselected.
33. `added` rejects an owner-account mismatch and cannot move another user's row.
34. `removed` marks a matching repository `removed` (therefore unavailable for
    actions), updates `last_synced_at`, and preserves the row.
35. Removing the selected repository atomically clears its selection.
36. Removing an unknown repository is an idempotent no-op.
37. Added/removed arrays are treated as deltas; omitted repositories are not
    changed.

### Audit, Environment, and UI Regression Tests

38. Each processed delivery writes no more than one sanitized audit row with its
    delivery ID.
39. Audit metadata contains no raw payload, tokens, secrets, signature, repository
    object, or exception text.
40. The webhook path never creates an Octokit client or installation token.
41. `GITHUB_WEBHOOK_SECRET` is required and remains server-only.
42. Dashboard shows active, suspended, and disconnected/uninstalled states
    correctly.
43. Dashboard never shows a removed/unavailable selected repository.
44. Repository management disables selection for suspended/uninstalled installs
    and removed/unavailable repositories.

Implementation may split these cases across files. All listed behaviors are
required; combining assertions does not remove a verification requirement.

---

## Manual Verification

Use the development GitHub App and a non-sensitive test repository.

1. Configure the webhook URL and secret and confirm the app reports successful
   deliveries.
2. Send a valid signed fixture to `POST /api/github/webhook`; confirm `200`, one
   delivery-ledger row, one sanitized audit row for a matched installation, and the
   expected lifecycle state.
3. Send the same delivery ID again; confirm no duplicate state or audit change.
4. Send the same payload with a missing, invalid, and one-byte-modified signature;
   confirm `401`, no ledger claim, no audit row, and no lifecycle mutation.
5. Suspend the GitHub App installation; confirm the installation becomes
   suspended, repositories become unavailable, the selection is cleared, and both
   UI surfaces show the suspended state.
6. Unsuspend it; confirm eligible repositories become active but no repository is
   automatically selected.
7. Remove access to a selected repository; confirm it becomes `removed`, remains
   historically stored, is unselected, and cannot be selected.
8. Add repository access; confirm metadata is upserted and the repository becomes
   available only if the installation is active.
9. Uninstall the app; confirm the installation becomes uninstalled, repositories
   are unavailable, selection is cleared, and the UI offers reconnection.
10. Inspect browser network responses, server logs, delivery/audit rows, and client
    bundles; confirm no webhook secret, signature, private key, service-role key,
    installation token, or full payload is exposed.

If a development installation is uninstalled during verification, reconnect it
through the normal Unit 07 setup callback before any later test. Do not repair user
association manually.

---

## Verification Checklist

### Implementation

- [ ] Only `POST /api/github/webhook` was added for webhook receipt.
- [ ] Raw bytes are read once with a 1 MiB cap.
- [ ] HMAC-SHA-256 is compared in constant time before parsing.
- [ ] Required headers and safe response codes match this specification.
- [ ] Only `installation` and `installation_repositories` are processed.
- [ ] GitHub action strings use `suspend` and `unsuspend` exactly.
- [ ] Verified stored installation/account identity supplies the user owner.
- [ ] Unmatched `created` cannot associate a user or create an installation row.
- [ ] Suspend/delete and repository removal clear active selection safely.
- [ ] Unsuspend does not restore removed repositories or prior selection.
- [ ] Repository rows and historical relationships are preserved.
- [ ] Delivery claims are atomic, concurrent-safe, recoverable, and conflict-aware.
- [ ] Lifecycle update, audit insert, and completion are transactional.
- [ ] Audit logs and responses contain only allowlisted sanitized information.
- [ ] No installation token or GitHub API call exists in the webhook path.
- [ ] Delivery ledger RLS and grants expose no browser/user access.
- [ ] Dashboard and repository page reflect all installation/access states.
- [ ] `GITHUB_WEBHOOK_SECRET` is required and server-only.
- [ ] GitHub App setup documentation is updated without broader permissions.
- [ ] All required automated tests pass.

### Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Every command must pass without warnings attributable to Unit 09.

### Completion Gate

Do not mark Unit 09 complete until:

- Every implementation checklist item passes.
- Every automated test above passes.
- The manual valid-signature, invalid-signature, suspension, unsuspension,
  repository removal/addition, and uninstall flows are verified.
- Database rows and UI states match this specification.
- Secret and payload non-exposure is manually checked.
- `context/database-schema.md`, `context/security-model.md`,
  `docs/github-app-setup.md`, and `context/progress-tracker.md` are updated to
  describe the implemented result.
- The implementation is reviewed and merged.

Until that gate passes, Unit 09 remains in progress. Do not begin Unit 10.

---

## What Comes Next

Nothing in this specification starts Unit 10. After this specification is reviewed
and merged, implement Unit 09 only. Unit 10 planning begins only after Unit 09 has
passed every verification item and has been marked complete.
