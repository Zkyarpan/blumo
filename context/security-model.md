# Blumo — Security Model

## Security Goal

Blumo must provide useful GitHub integration without gaining unnecessary control over a user's account or repository. Every sensitive operation is constrained by GitHub App permissions, Blumo ownership checks, safe-path rules, explicit approval, short-lived credentials, and auditability.

## GitHub Permission Model

### MVP Permissions

- Repository metadata: read-only.
- Repository contents: read and write.

Do not request in the MVP:

- Administration.
- Actions.
- Workflows.
- Secrets.
- Deployments.
- Members.
- Organization administration.
- Issues.
- Pull requests.

Pull-request permission may be added only when PR mode is formally introduced and documented.

### Repository Selection

The user chooses repository access on GitHub. Blumo never assumes access to all repositories.

### Token Rules

- Never ask for or store a personal access token.
- Never ask for a GitHub password.
- Never persist installation access tokens.
- Generate an installation access token immediately before a GitHub operation.
- Restrict a token to the required repository when supported by the operation.
- Discard the token after the operation.

## Authentication and Ownership

Every mutation must:

1. Retrieve the authenticated Supabase user on the server.
2. Load the target resource.
3. Verify the resource belongs to that user.
4. Verify any related resource belongs to the same user.
5. Validate the request.
6. Perform the mutation.
7. Store a sanitized audit event.

Never trust a client-provided `user_id`.

## GitHub App Installation Verification

The setup URL may contain an installation ID, but Blumo must not trust it directly.

The server must verify:

- The user is signed in to Blumo.
- The installation exists.
- The installation's account is associated with the signed-in GitHub identity or was deliberately connected through a verified flow.
- The repository returned by GitHub belongs to that installation.
- The installation has the permissions required for the requested operation.

## Safe Repository Paths

### Allowed MVP Root

```text
blumo/**
```

### Valid Examples

```text
blumo/README.md
blumo/learning/2026-07-19-react-state.md
blumo/challenges/2026-07-20-javascript-arrays.md
blumo/progress/weekly-2026-07-20.md
```

### Blocked Paths

Block exact or normalized paths matching:

```text
.env
.env.*
.github/**
.git/**
node_modules/**
credentials/**
credential/**
secrets/**
secret/**
keys/**
key/**
certificates/**
infrastructure/**
```

Also block:

- Absolute paths.
- Paths containing `..`.
- Null bytes.
- Backslash traversal.
- Encoded traversal after decoding.
- Empty paths.
- Paths not beginning with `blumo/`.

Path validation must run on the server immediately before the GitHub API call.

## Commit Limits

Initial limits:

- Maximum one successful commit per task.
- Maximum three generated files per future multi-file operation; MVP uses one file.
- Maximum submitted file content: 100 KB.
- Maximum commit message length: 100 characters.
- Maximum path length: 240 characters.
- Maximum AI regeneration attempts per task: configurable low limit.
- Rate limit commit attempts per user and task.

## Approval Model

The approval screen must display:

- Repository full name.
- Default or selected branch.
- Target file path.
- Whether the file is new or existing when known.
- Complete submitted content.
- Commit message.

Approval must be a fresh server-validated action. A client-side `approved = true` flag is not sufficient.

## AI Security

### Input

For the MVP, AI receives no private repository code.

### Output

Treat AI output as untrusted:

- Validate schema with Zod.
- Enforce allowed path independently of AI suggestion.
- Limit content size.
- Scan for common secret patterns.
- Escape content appropriately when rendered.
- Do not execute generated code.
- Do not use generated content as a shell command.
- Do not allow AI text to determine GitHub permissions or API endpoints.

### Prompt Injection

Future repository-aware features must treat README files, code comments, issues, and repository documents as untrusted data. Instructions discovered in repository content may not override system rules, authorization, path restrictions, or tool permissions.

## Secret Management

Server-only secrets include:

- Supabase service-role key.
- GitHub App private key.
- GitHub App client secret.
- GitHub webhook secret.
- Resend API keys.
- Pollinations API key.
- Cron secret.
- Future Stripe secret.

Rules:

- Store secrets in `.env.local` locally and protected Vercel/Supabase environment settings in production.
- Never prefix secrets with `NEXT_PUBLIC_`.
- Never print secrets in logs.
- Never return secrets in an API response.
- Never commit `.env.local`.
- Validate required environment variables on server startup or first use.
- Rotate a secret immediately after suspected exposure.

## Webhooks

The GitHub webhook endpoint must:

1. Read the raw request body.
2. Verify the HMAC signature before parsing or processing.
3. Use delivery ID for idempotency.
4. Accept only subscribed event types.
5. Record a sanitized result.
6. Respond quickly.
7. Move expensive future work to a background boundary.

Supported MVP events:

- `installation`
- `installation_repositories`

Handle:

- installation created
- installation suspended
- installation unsuspended
- installation deleted
- repository added
- repository removed

## Supabase Security

- Enable RLS on every user-owned table.
- Test policies with two separate test users.
- Use the anon/publishable key in browser code.
- Use service role only in server-only code.
- Never use service role as a shortcut around missing RLS policies.
- Use database constraints for single-active-goal, single-selected-repository, and single-commit-per-task rules.

## Email Security

- Use separate Resend keys for Supabase Auth SMTP and product email.
- Do not place sensitive private repository content in email.
- Do not include secrets in links.
- Use application URLs generated from an allowlisted base URL.
- Honour notification preferences.
- Operational security alerts may remain enabled where legally and product-appropriately required.

## Logging

Log:

- Internal request ID.
- User ID where permitted.
- Resource ID.
- Stable event code.
- Success or safe error category.
- Provider delivery or request identifier when safe.

Do not log:

- Full access tokens.
- Private keys.
- API secrets.
- Full user content by default.
- Full webhook bodies.
- Unredacted provider errors.

## Failure Behaviour

- A failed AI call must not create a task with invalid content.
- A failed GitHub commit leaves the task recoverable.
- A successful GitHub commit followed by a database failure must enter reconciliation handling; never retry blindly and create a duplicate commit.
- A removed repository immediately becomes unavailable for new commits.
- An uninstalled or suspended GitHub App disables repository actions.
