# Unit 07: GitHub App Setup Callback and Installation Verification

## Goal

Process the GitHub App setup callback at `/api/github/setup`. When GitHub
redirects the user back after installing the Blumo App, this route handler:

1. Verifies the signed-in Blumo session.
2. Safely parses the callback query parameters.
3. Authenticates as the GitHub App using the private key.
4. Retrieves the installation from the GitHub API.
5. Verifies the installation account matches the signed-in user's GitHub identity.
6. Upserts verified installation metadata into `github_installations`.
7. Records a sanitized audit event.
8. Redirects the user to the repository selection page (placeholder redirect
   to `/dashboard` until Unit 08 implements `/github/repositories`).

The setup callback **never trusts the `installation_id` query parameter
without independent server-side verification against the GitHub API.**

At the end of Unit 07 the only verifiable result is: a signed-in, onboarded
user who installed the Blumo App on their own GitHub account is redirected
back, the installation is stored in `github_installations` with `status =
'active'`, and the user lands on the dashboard with no errors.

---

## Dependencies

- Unit 06 complete: GitHub App configuration exists (`github-app.config.ts`,
  env vars validated), installation start URL works, `/github/connect` page
  exists.
- `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` are present in `.env.local`
  with real values for the Blumo Development App.
- `github_installations` table exists in the remote Supabase project with RLS
  enabled (Unit 03).
- `audit_logs` table exists (Unit 03).
- `profiles` table contains `github_user_id` (bigint) — used to verify
  ownership of the installation.
- New npm packages required:
  - `@octokit/auth-app` — creates a signed GitHub App JWT from App ID and
    private key.
  - `@octokit/rest` — Octokit REST client for GitHub API calls.
  - (or `octokit` which bundles both; prefer individual packages to keep the
    bundle minimal — see Package Decision below.)

---

## Package Decision

Install `@octokit/auth-app` and `@octokit/rest` as separate packages. Do not
install `octokit` (the meta-package) because it pulls in GraphQL and webhook
parsers that are not required in Unit 07. These are added explicitly as
server-side runtime dependencies.

```bash
npm install @octokit/auth-app @octokit/rest
```

Both packages are server-only. They must never appear in a client bundle.

---

## Scope

### Included

- New route handler: `src/app/api/github/setup/route.ts`.
- New server-only module: `src/lib/github/app-auth.ts` — creates a GitHub App
  JWT and returns an authenticated Octokit instance.
- New server-only module: `src/lib/github/installation-lookup.ts` — retrieves
  and normalizes an installation from the GitHub API.
- New server-only service: `src/features/github/installation.service.ts` —
  orchestrates verification, ownership check, upsert, and audit event.
- New Zod schema: `src/lib/github/callback-params.schema.ts` — validates the
  raw query parameters from the GitHub callback.
- Unit tests covering all required scenarios (see Tests section).
- `GITHUB_WEBHOOK_SECRET` in `src/lib/env/server.ts` tightened from
  `.optional()` to `.min(1)` **only if** the value is present in `.env.local`.
  If the local value is still empty, leave it optional and document that it
  will become required in Unit 09.

### Explicitly Excluded

- Repository synchronization — Unit 08.
- Repository selection page (`/github/repositories`) — Unit 08.
- Installation access token generation and storage — Unit 08 onwards.
- Webhook processing — Unit 09.
- Organization installation handling beyond the defined MVP rule (see below).
- Resend email on connection — Unit 17.
- AI, task generation, commit creation, scheduling, payments.

---

## Callback Flow

```
GitHub (after user installs)
  │
  └─ GET /api/github/setup
       ?installation_id=<number>
       &setup_action=install | update | (absent if cancelled)
  │
  Route Handler
  │
  ├─ 1. Parse + validate query params (Zod)
  │       • installation_id: integer string → number
  │       • setup_action: "install" | "update" | undefined
  │       • If installation_id is missing → redirect to /github/connect?error=missing_installation
  │
  ├─ 2. Verify Blumo session
  │       • getUser() — must be signed in
  │       • getProfile() — must have onboarding_completed_at set
  │       • If not signed in → redirect to /login
  │       • If not onboarded → redirect to /onboarding
  │
  ├─ 3. Handle cancelled installation
  │       • If setup_action is absent and installation_id is absent
  │         → redirect to /github/connect?error=cancelled
  │       • (GitHub does not always send a callback for cancellations;
  │          absence of setup_action with a valid installation_id is treated
  │          as a completed install to be verified)
  │
  ├─ 4. Authenticate as the GitHub App
  │       • Create a signed JWT using App ID + private key
  │       • Build an App-authenticated Octokit instance
  │       • This step must never expose the private key
  │
  ├─ 5. Retrieve installation from GitHub API
  │       • GET /app/installations/{installation_id}
  │       • If GitHub returns 404 → redirect to /github/connect?error=invalid_installation
  │       • If GitHub returns any other error → redirect to /github/connect?error=github_unavailable
  │
  ├─ 6. Verify ownership
  │       • Compare installation.account.id (GitHub numeric ID) against
  │         profiles.github_user_id for the signed-in user
  │       • If they do not match → redirect to /github/connect?error=ownership_mismatch
  │       • MVP supports User installations only; if installation.account.type
  │         is "Organization" → redirect to /github/connect?error=org_not_supported
  │
  ├─ 7. Upsert installation record
  │       • Write to github_installations using the admin Supabase client
  │         (service role) because the RLS INSERT policy on github_installations
  │         requires a trusted server boundary for verified data
  │       • Fields: user_id, installation_id, account_id, account_login,
  │         account_type, status = 'active', installed_at = now()
  │       • onConflict: 'installation_id' — update user_id, account fields,
  │         status, installed_at on repeat
  │
  ├─ 8. Ownership uniqueness guard
  │       • Before upsert, check whether installation_id already exists with
  │         a different user_id in github_installations
  │       • If a conflict is found → redirect to /github/connect?error=installation_conflict
  │
  ├─ 9. Record audit event
  │       • action: 'github_installation_connected'
  │       • resource_type: 'installation'
  │       • resource_id: the github_installations UUID
  │       • metadata: { installation_id, account_login, account_type,
  │                     setup_action }  — no tokens, no private keys
  │
  └─ 10. Redirect to repository selection
          • Redirect to /github/repositories (placeholder: /dashboard until
            Unit 08 creates that page)
          • Always use an internal application URL; never redirect to a
            client-supplied URL
```

---

## Environment Variables

No new variables are added. All required variables were added in Unit 06:

| Variable | Required now | Notes |
|---|---|---|
| `GITHUB_APP_ID` | Yes | Used to sign the App JWT |
| `GITHUB_APP_PRIVATE_KEY` | Yes | PEM with `\\n` sequences; normalised on read |
| `GITHUB_APP_SLUG` | Yes | Not used in this unit; already validated |
| `GITHUB_WEBHOOK_SECRET` | Optional | Required in Unit 09; leave schema as-is |
| `GITHUB_APP_CLIENT_ID` | Optional | Not used in this unit |
| `GITHUB_APP_CLIENT_SECRET` | Optional | Not used in this unit |

---

## File Structure

```
src/
├── app/
│   └── api/
│       └── github/
│           └── setup/
│               └── route.ts              ← new (Route Handler)
├── features/
│   └── github/
│       └── installation.service.ts       ← new (orchestration)
└── lib/
    └── github/
        ├── app-auth.ts                   ← new (JWT + Octokit factory)
        ├── installation-lookup.ts        ← new (GitHub API call)
        ├── callback-params.schema.ts     ← new (Zod schema for query params)
        ├── app-auth.test.ts              ← new
        ├── installation-lookup.test.ts   ← new
        └── installation.service.test.ts  ← new (in features/github/)
```

`installation.service.test.ts` is colocated in `src/features/github/` alongside
`installation.service.ts`.

---

## Module Specifications

### `src/lib/github/callback-params.schema.ts`

```ts
import { z } from "zod";

export const callbackParamsSchema = z.object({
  installation_id: z
    .string()
    .regex(/^\d+$/, "installation_id must be a numeric string")
    .transform((v) => parseInt(v, 10)),
  setup_action: z
    .enum(["install", "update"])
    .optional(),
});

export type CallbackParams = z.infer<typeof callbackParamsSchema>;
```

- `installation_id` is required. If absent the route redirects immediately
  without attempting a GitHub API call.
- `setup_action` is optional because some flows omit it.
- No other query parameters are read or trusted.

---

### `src/lib/github/app-auth.ts`

```ts
import "server-only";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { getGitHubAppConfig } from "@/lib/github/github-app.config";

/**
 * Returns an Octokit instance authenticated as the GitHub App.
 * Uses a short-lived signed JWT; does not request an installation token.
 * The JWT is valid for 10 minutes and is used only for App-level API calls.
 *
 * Never call this in client code. Import "server-only" enforces this.
 */
export function createAppOctokit(): Octokit {
  const { appId, privateKey } = getGitHubAppConfig();

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
    },
  });
}
```

- Marked `server-only`.
- Creates a fresh Octokit instance per call; does not cache between requests.
- `privateKey` is the normalised (real newlines) value from `github-app.config.ts`.
- The App JWT is created internally by `@octokit/auth-app`; it is never logged
  or returned.
- Does not generate an installation access token. Installation tokens are
  deferred to Unit 08.

---

### `src/lib/github/installation-lookup.ts`

```ts
import "server-only";
import type { Octokit } from "@octokit/rest";

export type GitHubInstallationAccount = {
  id: number;
  login: string;
  type: "User" | "Organization";
};

export type GitHubInstallation = {
  id: number;
  account: GitHubInstallationAccount;
};

/**
 * Retrieves a GitHub App installation by its numeric ID.
 * Returns null if the installation does not exist (404) or is inaccessible.
 * Throws for unexpected network or API errors so the caller can normalize them.
 *
 * The Octokit instance must be authenticated as the App (not an installation).
 */
export async function getInstallationById(
  octokit: Octokit,
  installationId: number
): Promise<GitHubInstallation | null> {
  try {
    const response = await octokit.rest.apps.getInstallation({
      installation_id: installationId,
    });

    const { id, account } = response.data;

    if (!account || !("login" in account) || !("type" in account)) {
      return null;
    }

    return {
      id,
      account: {
        id: account.id,
        login: account.login,
        type: account.type as "User" | "Organization",
      },
    };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status: number }).status === 404
    ) {
      return null;
    }
    throw error;
  }
}
```

- Marked `server-only`.
- Returns `null` on 404; rethrows on any other error.
- Typed narrowly — only the fields the application needs are returned.
- Does not parse or trust fields beyond what is used.

---

### `src/features/github/installation.service.ts`

```ts
import "server-only";
```

This module orchestrates the full verification + storage flow. It is called
exclusively by the route handler.

**Exported function:**

```ts
export type InstallationResult =
  | { ok: true; installationRowId: string }
  | { ok: false; errorCode: InstallationErrorCode };

export type InstallationErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_ONBOARDED"
  | "MISSING_INSTALLATION_ID"
  | "INVALID_INSTALLATION"
  | "GITHUB_UNAVAILABLE"
  | "OWNERSHIP_MISMATCH"
  | "ORG_NOT_SUPPORTED"
  | "INSTALLATION_CONFLICT"
  | "DB_ERROR";

export async function processInstallationCallback(
  installationId: number,
  userId: string,
  githubUserId: number
): Promise<InstallationResult>
```

**Steps performed (in order):**

1. Create an App-authenticated Octokit using `createAppOctokit()`.
2. Call `getInstallationById(octokit, installationId)`.
   - If `null` → return `{ ok: false, errorCode: "INVALID_INSTALLATION" }`.
   - On thrown error → return `{ ok: false, errorCode: "GITHUB_UNAVAILABLE" }`.
3. Check `installation.account.type`:
   - If `"Organization"` → return `{ ok: false, errorCode: "ORG_NOT_SUPPORTED" }`.
4. Verify `installation.account.id === githubUserId`:
   - If not equal → return `{ ok: false, errorCode: "OWNERSHIP_MISMATCH" }`.
5. Using the **admin Supabase client** (`createSupabaseAdminClient`):
   a. Check whether `installation_id` already exists in `github_installations`
      with a **different** `user_id`.
      - If yes → return `{ ok: false, errorCode: "INSTALLATION_CONFLICT" }`.
   b. Upsert the record:
      ```ts
      {
        user_id: userId,
        installation_id: installationId,
        account_id: installation.account.id,
        account_login: installation.account.login,
        account_type: installation.account.type,
        status: "active",
        installed_at: new Date().toISOString(),
      }
      ```
      `onConflict: "installation_id"` — update all fields on conflict.
   c. If the upsert returns an error → return `{ ok: false, errorCode: "DB_ERROR" }`.
6. Insert audit event into `audit_logs`:
   ```ts
   {
     user_id: userId,
     action: "github_installation_connected",
     resource_type: "installation",
     resource_id: <upserted row UUID>,
     metadata: {
       installation_id: installationId,
       account_login: installation.account.login,
       account_type: installation.account.type,
     },
   }
   ```
   - Audit failure does not roll back the upsert; log the error server-side
     and continue.
7. Return `{ ok: true, installationRowId: <upserted row UUID> }`.

**Why admin client:**
`github_installations` upserts with verified data from GitHub must run on a
trusted server boundary. The anon-key RLS INSERT policy is intentionally
restrictive. The admin client is imported from `src/lib/supabase/admin.ts` and
is already `server-only`.

---

### `src/app/api/github/setup/route.ts`

Route Handler. Exported function: `export async function GET(request: Request)`.

**Do not use `export default`.** Next.js Route Handlers use named HTTP-method
exports.

```
Flow:
  1. Parse URL search params
  2. Validate with callbackParamsSchema
  3. Verify Blumo session (getUser + getProfile)
  4. Handle setup_action absent + installation_id absent → cancelled redirect
  5. Call processInstallationCallback(installationId, user.id, profile.github_user_id)
  6. Map result error codes to safe redirect targets
  7. On success → redirect to /dashboard (placeholder for /github/repositories)
```

**Redirect targets:**

| Condition | Redirect |
|---|---|
| Parse error / missing installation_id | `/github/connect?error=missing_installation` |
| Not signed in | `/login` |
| Not onboarded | `/onboarding` |
| Cancelled (both params absent) | `/github/connect?error=cancelled` |
| `INVALID_INSTALLATION` | `/github/connect?error=invalid_installation` |
| `GITHUB_UNAVAILABLE` | `/github/connect?error=github_unavailable` |
| `OWNERSHIP_MISMATCH` | `/github/connect?error=ownership_mismatch` |
| `ORG_NOT_SUPPORTED` | `/github/connect?error=org_not_supported` |
| `INSTALLATION_CONFLICT` | `/github/connect?error=installation_conflict` |
| `DB_ERROR` | `/github/connect?error=server_error` |
| Success | `/dashboard` |

All redirects use `NextResponse.redirect(new URL(<path>, request.url))` with
internal application paths only. No client-supplied URL is ever used as a
redirect target.

**Never** set a JSON response body for this route. It is a redirect-only
handler. If a JSON body is returned, the browser will display raw JSON rather
than navigating, which is confusing and insecure.

---

## ConnectGitHubPage Error Display

`src/features/github/ConnectGitHubPage.tsx` already exists from Unit 06.
It must be extended to read and display error states from the URL query
parameter.

The page receives no props change from the server. The `searchParams` prop is
read from the page component (`src/app/(app)/github/connect/page.tsx`) and
passed to `ConnectGitHubPage` as a new optional prop:

```ts
interface ConnectGitHubPageProps {
  installationUrl: string;
  error?: string;  // ← new
}
```

**Error messages by code:**

| `error` query value | User-facing message |
|---|---|
| `cancelled` | "Installation was cancelled. You can try again when you're ready." |
| `missing_installation` | "Something went wrong with the GitHub redirect. Please try again." |
| `invalid_installation` | "Blumo could not verify that installation. Please install the App again." |
| `github_unavailable` | "GitHub is temporarily unavailable. Please try again in a moment." |
| `ownership_mismatch` | "This installation belongs to a different GitHub account. Sign in with the correct account and try again." |
| `org_not_supported` | "Organisation installations are not yet supported. Please install the App on a personal account." |
| `installation_conflict` | "This installation is already connected to another Blumo account. Contact support if you believe this is an error." |
| `server_error` | "Something went wrong on our end. Please try again." |
| any unrecognized value | "Something went wrong. Please try again." |

The error banner uses the existing error-state styling (red soft background,
`var(--state-error-soft)`, `var(--state-error)`). It is dismissed by clicking
"Try again" (which navigates to `/github/connect` without the query param).

---

## Database Behaviour

### Table: `github_installations`

No schema migration is needed. The table was created in Unit 03. Confirm
the existing columns match what is written:

| Column | Written by Unit 07 |
|---|---|
| `user_id` | ✓ |
| `installation_id` | ✓ |
| `account_id` | ✓ |
| `account_login` | ✓ |
| `account_type` | ✓ |
| `status` | ✓ (`'active'`) |
| `installed_at` | ✓ |
| `suspended_at` | Not written (null) |
| `uninstalled_at` | Not written (null) |

### Upsert Strategy

```sql
ON CONFLICT (installation_id)
DO UPDATE SET
  user_id        = EXCLUDED.user_id,
  account_id     = EXCLUDED.account_id,
  account_login  = EXCLUDED.account_login,
  account_type   = EXCLUDED.account_type,
  status         = 'active',
  installed_at   = EXCLUDED.installed_at,
  updated_at     = now()
```

This is safe because:
- Ownership uniqueness is checked **before** the upsert.
- The callback can only arrive for a real GitHub installation that was just
  confirmed by the GitHub API.
- The `installation_id` unique constraint enforces the single-owner invariant
  at the database level.

### No Tokens Stored

Do not add any column to `github_installations` for an access token. The
architecture invariant (from `context/architecture.md`) is: installation
access tokens are generated only when required and never stored permanently.

---

## Security Rules for This Unit

1. **Authentication is mandatory.** The route handler calls `getUser()` on
   the server before any GitHub API call. An unauthenticated request receives
   a redirect to `/login`.
2. **`installation_id` is never trusted directly.** The GitHub API lookup is
   mandatory before any database write.
3. **Ownership is verified by GitHub account ID, not login.** Logins can be
   renamed; numeric IDs are stable. The comparison is
   `installation.account.id === profile.github_user_id` (both integers).
4. **Organization installations are rejected in the MVP.** There is no
   membership verification logic for organizations. Returning
   `ORG_NOT_SUPPORTED` is safe and explicit.
5. **`user_id` is never accepted from the client.** The route handler derives
   it from the authenticated session.
6. **Admin client scope is minimal.** `createSupabaseAdminClient()` is used
   only for the `github_installations` upsert and `audit_logs` insert.
   `getUser()` and `getProfile()` still use the anon-key server client.
7. **Redirect targets are hard-coded paths.** No query parameter, header, or
   body value from the request is used as a redirect destination.
8. **The App JWT and private key are never logged.** The `createAppOctokit()`
   function does not return, log, or serialize the key. Error handlers must
   not include the raw error object from Octokit in a response body or log
   at the `console.log(secret)` level.
9. **The callback can be replayed safely.** The upsert with conflict resolution
   means a second identical callback produces the same result without creating
   a duplicate row or duplicate audit event.
10. **`github_user_id` must be populated in `profiles`.** The route handler
    must check that `profile.github_user_id` is not null before comparing.
    If it is null (trigger failure path from Unit 04 bug), redirect to
    `/github/connect?error=server_error` and log the anomaly for investigation.

---

## MVP Rule: Organization Installations

Organization installations are **not supported** in the MVP. The reasons are:

- Verifying that a Blumo user has the required role in an organization
  requires additional GitHub API calls and membership checks.
- Organization repositories may be owned or administered by accounts other
  than the installing user.
- No organizational permission request is documented in the approved GitHub
  App permission set.

When the callback `installation.account.type === "Organization"`, the handler
returns `ORG_NOT_SUPPORTED` and the user sees a plain-language explanation.

To add organization support in the future, a documented architecture decision
must be created, GitHub App permissions must be reviewed, and the membership
verification logic must be implemented and tested.

---

## UI States

These states are rendered on the existing `/github/connect` page using the
`error` query parameter. No new page is created in Unit 07.

| State | How it arrives |
|---|---|
| **Success → redirect** | User lands on `/dashboard` (later `/github/repositories`) |
| **Cancelled** | `?error=cancelled` |
| **Invalid installation** | `?error=invalid_installation` |
| **GitHub unavailable** | `?error=github_unavailable` |
| **Ownership mismatch** | `?error=ownership_mismatch` |
| **Org not supported** | `?error=org_not_supported` |
| **Installation conflict** | `?error=installation_conflict` |
| **Server error** | `?error=server_error` |

Each error state renders:
- A dismissable error banner above the permission card.
- The **Connect GitHub** button remains visible so the user can retry.
- A "Try again" link removes the error query param.

The dashboard `GitHubConnectionCard` is not updated in Unit 07. It still
shows the "not connected" state. Real connection state is introduced in
Unit 08 when repository metadata is fetched.

---

## Tests

### Location

- `src/lib/github/app-auth.test.ts`
- `src/lib/github/installation-lookup.test.ts`
- `src/features/github/installation.service.test.ts`

### Required Test Cases

| # | File | Scenario | Expected result |
|---|---|---|---|
| 1 | `installation-lookup.test.ts` | GitHub API returns a valid User installation | Returns typed `GitHubInstallation` object |
| 2 | `installation-lookup.test.ts` | GitHub API returns 404 | Returns `null` |
| 3 | `installation-lookup.test.ts` | GitHub API throws a non-404 error | Rethrows the error |
| 4 | `installation-lookup.test.ts` | GitHub API returns an account with no login | Returns `null` |
| 5 | `installation.service.test.ts` | Valid callback for matching User installation | Returns `{ ok: true }` and upserts record |
| 6 | `installation.service.test.ts` | GitHub API returns 404 for installation_id | Returns `INVALID_INSTALLATION` |
| 7 | `installation.service.test.ts` | GitHub API throws unexpected error | Returns `GITHUB_UNAVAILABLE` |
| 8 | `installation.service.test.ts` | Installation account.id does not match profile.github_user_id | Returns `OWNERSHIP_MISMATCH` |
| 9 | `installation.service.test.ts` | Installation account.type is "Organization" | Returns `ORG_NOT_SUPPORTED` |
| 10 | `installation.service.test.ts` | installation_id already exists with different user_id | Returns `INSTALLATION_CONFLICT` |
| 11 | `installation.service.test.ts` | Same user calls callback twice (idempotent) | Returns `{ ok: true }`, no duplicate row |
| 12 | `installation.service.test.ts` | Database upsert fails | Returns `DB_ERROR` |
| 13 | `installation.service.test.ts` | profile.github_user_id is null | Returns server error (logged) |
| 14 | `app-auth.test.ts` | `createAppOctokit()` is called with valid config | Returns an Octokit instance |
| 15 | `app-auth.test.ts` | Private key with escaped `\\n` is normalised before auth | Auth does not throw |

### Test Patterns

All test files must mock `server-only`:

```ts
vi.mock("server-only", () => ({}));
```

`installation-lookup.test.ts` — mock the Octokit instance:

```ts
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      apps: {
        getInstallation: vi.fn(),
      },
    },
  })),
}));
```

`installation.service.test.ts` — mock `createAppOctokit`, `getInstallationById`,
and `createSupabaseAdminClient`:

```ts
vi.mock("@/lib/github/app-auth");
vi.mock("@/lib/github/installation-lookup");
vi.mock("@/lib/supabase/admin");
```

`app-auth.test.ts` — mock `@octokit/auth-app` and `@octokit/rest` to avoid
requiring real credentials:

```ts
vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn() }));
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@/lib/github/github-app.config", () => ({
  getGitHubAppConfig: vi.fn().mockReturnValue({
    appId: 1234567,
    appSlug: "blumo-development",
    privateKey: "-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----\n",
    webhookSecret: undefined,
    clientId: undefined,
    clientSecret: undefined,
  }),
}));
```

### Minimum New Tests

15 new tests. Total after Unit 07: **53+**.

---

## What Is Not Changed

- SQL migrations — no new tables or columns required.
- `src/lib/supabase/` clients — admin client already exists.
- `src/proxy.ts` — `/github` is already in `PROTECTED_PATHS`.
- `src/lib/github/github-app.config.ts` — already normalises the private key.
- `src/lib/github/installation-url.ts` — unchanged.
- Existing onboarding, dashboard, and auth modules.
- Marketing pages, login page.

---

## Data Flow Diagram

```
Browser
  │
  └─ GET /api/github/setup?installation_id=X&setup_action=install
                                │
                         route.ts (GET handler)
                                │
               ┌────────────────┼────────────────┐
               │                │                │
         Zod parse         getUser()        getProfile()
               │         (Supabase anon)  (Supabase anon)
               │
        installation.service.ts
               │
       createAppOctokit()
       (App JWT via @octokit/auth-app)
               │
       getInstallationById(octokit, X)
       (GitHub API: GET /app/installations/X)
               │
       Verify account.id === profile.github_user_id
               │
       createSupabaseAdminClient()
       Check for conflict in github_installations
               │
       Upsert github_installations
               │
       Insert audit_logs
               │
       return { ok: true, installationRowId }
                                │
                         redirect → /dashboard
```

---

## Verification Checklist

- [ ] `@octokit/auth-app` and `@octokit/rest` are installed.
- [ ] `src/lib/github/callback-params.schema.ts` validates `installation_id`
  as a numeric string and `setup_action` as optional enum.
- [ ] `src/lib/github/app-auth.ts` is marked `server-only` and creates an
  App-authenticated Octokit instance.
- [ ] `src/lib/github/installation-lookup.ts` is marked `server-only` and
  returns `null` on 404, rethrows on other errors.
- [ ] `src/features/github/installation.service.ts` is marked `server-only`.
- [ ] `processInstallationCallback` verifies ownership using numeric GitHub
  account ID, not login.
- [ ] Organization installations return `ORG_NOT_SUPPORTED`.
- [ ] Duplicate callback with the same `installation_id` and same `user_id`
  is idempotent (does not create a duplicate row).
- [ ] An `installation_id` already owned by a different user returns
  `INSTALLATION_CONFLICT`.
- [ ] `null` `github_user_id` in `profiles` is handled safely without panic.
- [ ] The admin Supabase client is used only for the upsert and audit insert.
- [ ] `getUser()` and `getProfile()` use the anon-key server client.
- [ ] The route handler uses only internal hard-coded redirect paths.
- [ ] No token, private key, or JWT appears in any log, response body, or
  error message.
- [ ] `src/app/(app)/github/connect/page.tsx` reads `searchParams` and passes
  `error` to `ConnectGitHubPage`.
- [ ] `ConnectGitHubPage` renders the correct user-facing message for each
  error code.
- [ ] A manually triggered valid callback stores a row in `github_installations`
  with `status = 'active'`.
- [ ] A manually triggered invalid `installation_id` shows the correct error
  on `/github/connect`.
- [ ] `npm run lint` passes with no errors.
- [ ] `npm run typecheck` passes with no errors.
- [ ] `npm run test` passes (53+ total, 15+ new tests).
- [ ] `npm run build` passes with no errors.
- [ ] `context/progress-tracker.md` records Unit 07 completion.

---

## What Comes Next

Unit 08 implements repository synchronization and selection. After a verified
installation is stored, Unit 08:

1. Generates a short-lived installation access token using
   `octokit.rest.apps.createInstallationAccessToken`.
2. Lists accessible repositories with `octokit.rest.apps.listReposAccessibleToInstallation`.
3. Syncs repository metadata into the `repositories` table.
4. Presents the user with a repository selection page at `/github/repositories`.
5. Stores the selected repository ID on the user's profile or as a marked row.

Unit 08 is the first unit that requires a live installation access token.
The token is generated on demand and never stored.
