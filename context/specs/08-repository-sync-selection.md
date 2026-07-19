# Unit 08: Repository Sync and Selection

## Goal

After a verified GitHub App installation is stored in `github_installations`, allow
the authenticated, onboarded user to:

1. Generate a short-lived GitHub App installation token on the server.
2. List repositories accessible to that installation through the GitHub API.
3. Synchronize verified repository metadata into the `repositories` table.
4. View the list and select exactly one active repository.
5. See the selected repository reflected on the dashboard.

At the end of Unit 08 the only verifiable result is: a signed-in, onboarded user
with a verified active installation can view their accessible repositories, select
one, and see it referenced on the dashboard. No token is stored or returned to the
browser. No repository file content is read. No commits are created.

---

## Dependencies

- Unit 07 complete: `github_installations` table contains at least one row with
  `status = 'active'` for the test user.
- `repositories` table exists with RLS enabled (Unit 03).
- `audit_logs` table exists (Unit 03).
- `github_installations` partial unique index on `installation_id` enforced.
- `repositories_one_selected_per_user_idx` partial unique index enforced
  (Unit 03): `WHERE is_selected = true AND access_status = 'active'`.
- `@octokit/auth-app` and `@octokit/rest` are installed (Unit 07).
- `src/lib/github/app-auth.ts` `createAppOctokit()` exists (Unit 07).
- `src/lib/github/github-app.config.ts` `getGitHubAppConfig()` exists (Unit 07).
- `src/lib/supabase/admin.ts` `createSupabaseAdminClient()` exists (Unit 02).

---

## Package Decision

No new packages are required. `@octokit/auth-app` and `@octokit/rest` are already
installed and provide everything needed:

- `octokit.rest.apps.createInstallationAccessToken` — generates the short-lived
  token.
- `octokit.rest.apps.listReposAccessibleToInstallation` — lists repositories using
  the installation token.

Both calls are server-only.

---

## Scope

### Included

- New server-only module: `src/lib/github/installation-token.ts` — generates a
  short-lived installation access token for a verified installation.
- New server-only module: `src/lib/github/repository-list.ts` — lists repositories
  accessible to an installation using the installation token.
- New server-only service: `src/features/github/repository-sync.service.ts` —
  fetches accessible repositories, upserts metadata into `repositories`, marks
  removed repositories, and records an audit event.
- New server-only service: `src/features/github/repository-selection.service.ts` —
  verifies ownership, validates the repository belongs to the user's installation,
  atomically clears any previous selection, sets the new selection, and records an
  audit event.
- New Server Component page: `src/app/(app)/github/repositories/page.tsx` —
  repository selection page; fetches verified installation and synced repositories
  server-side.
- New loading placeholder: `src/app/(app)/github/repositories/loading.tsx`.
- New Client Component: `src/features/github/RepositoryList.tsx` — renders the
  list of repositories with selection controls; handles loading, empty, error, and
  success states.
- New Server Action: `src/features/github/select-repository.actions.ts` — wrapped
  Server Action that calls `repository-selection.service.ts`.
- Updated: `src/features/dashboard/GitHubConnectionCard.tsx` — shows selected
  repository name and "Manage repositories" link when a selection exists; falls back
  to current not-connected state otherwise.
- Unit tests for all new modules (see Tests section).
- `src/app/(app)/github/repositories` added to `PROTECTED_PATHS` in `src/proxy.ts`
  (the `/github` prefix is already protected, but the sub-path is added for
  completeness and explicitness).

### Explicitly Excluded

- Repository content reads.
- Branch creation or modification.
- File creation, update, or deletion.
- GitHub commits.
- Pull requests.
- Webhook processing — Unit 09.
- Installation access token persistence.
- Organization installation support.
- AI or Pollinations.
- Mission generation.
- Resend email.
- Scheduling.
- Payments.
- Unit 09 or later functionality.

---

## Preconditions

Before any repository operation is performed the route or service must confirm:

1. User is signed in (authenticated Supabase session).
2. User has completed onboarding (`onboarding_completed_at IS NOT NULL`).
3. User has exactly one `github_installations` row where:
   - `user_id = auth.uid()`
   - `status = 'active'`
4. Suspended (`status = 'suspended'`) or uninstalled (`status = 'uninstalled'`)
   installations are rejected with a clear error code and user-facing message.
5. If no active installation exists, the user is directed to `/github/connect`.

If any precondition fails, redirect or return the appropriate error before touching
the GitHub API.

---

## Installation Token

### Rules

- Generated **only on the server** using the GitHub App ID and private key.
- Scoped to the verified `installation_id` from `github_installations`.
- Lifetime is short (GitHub issues tokens valid for up to 1 hour; use immediately).
- **Never stored** in the database, cookie, response body, or log.
- **Never returned to the browser** in any form.
- Discarded after the GitHub API operation that required it completes.
- The token string must never appear in `console.log`, error messages, or audit
  metadata.

### Generation

Use an installation-scoped Octokit instance created from the App-authenticated
Octokit:

```ts
// Conceptual flow — see module spec below
const appOctokit = createAppOctokit();
const { token } = await appOctokit.rest.apps.createInstallationAccessToken({
  installation_id: installationId,
});
// Use token immediately — never store or return it
const repoList = await listRepositoriesWithToken(token, installationId);
// token reference goes out of scope
```

The token object from GitHub contains `token`, `expires_at`, and `permissions`.
Only `token` is used. `expires_at` and `permissions` are not stored.

---

## Repository Synchronization

### Data Flow

```
Verified active installation
  │
  ├─ Generate short-lived installation token (server only)
  │
  ├─ GET /installation/repositories (Octokit)
  │       paginate if total_count > 30
  │
  ├─ For each repository returned by GitHub:
  │       Upsert into repositories (user_id, github_repository_id)
  │       Fields: owner, name, full_name, default_branch,
  │               is_private, access_status = 'active',
  │               installation_id (UUID FK), last_synced_at = now()
  │
  ├─ Mark repositories previously synced for this installation
  │   but absent from the current GitHub response as 'removed'
  │
  ├─ Record sanitized audit event
  │       action: 'repositories_synced'
  │       resource_type: 'installation'
  │       resource_id: github_installations.id (UUID)
  │       metadata: { repository_count, removed_count }
  │
  └─ Return list of active repositories
```

### Fields Written

| Column | Source | Notes |
|---|---|---|
| `user_id` | Authenticated session | Never from client |
| `installation_id` | `github_installations.id` (UUID FK) | Resolved from verified row |
| `github_repository_id` | GitHub API `repository.id` | Stable numeric ID |
| `owner` | `repository.owner.login` | |
| `name` | `repository.name` | |
| `full_name` | `repository.full_name` | `owner/name` |
| `default_branch` | `repository.default_branch` | Never assumed `main` |
| `is_private` | `repository.private` | Boolean |
| `is_selected` | Not set during sync | Set only by selection action |
| `access_status` | `'active'` on sync | `'removed'` when absent from GitHub |
| `last_synced_at` | `new Date().toISOString()` | |

### Upsert Strategy

Conflict key: `(user_id, github_repository_id)`.

On conflict, update all fields except `is_selected`. Do not change a user's
current selection during a sync. A repository that is still accessible but was
previously `is_selected = true` retains its selection state.

```sql
ON CONFLICT (user_id, github_repository_id)
DO UPDATE SET
  installation_id  = EXCLUDED.installation_id,
  owner            = EXCLUDED.owner,
  name             = EXCLUDED.name,
  full_name        = EXCLUDED.full_name,
  default_branch   = EXCLUDED.default_branch,
  is_private       = EXCLUDED.is_private,
  access_status    = EXCLUDED.access_status,
  last_synced_at   = EXCLUDED.last_synced_at,
  updated_at       = now()
-- is_selected is NOT updated here
```

### Removed Repository Handling

After upserting all repositories returned by GitHub, query the `repositories` table
for rows where:
- `user_id = userId`
- `installation_id = installationRowId`
- `access_status = 'active'`
- `github_repository_id NOT IN (<ids from GitHub response>)`

Set `access_status = 'removed'` and `is_selected = false` on those rows.

Preserve historical records — never delete a repository row.

### Pagination

GitHub returns up to 30 repositories per page by default (maximum 100). Paginate
until all pages are retrieved using `octokit.paginate` or manual `page` iteration.
Log the total count but do not expose it in error messages.

---

## Repository Selection

### Rules

1. The user may select exactly one repository that has:
   - `access_status = 'active'`
   - The repository belongs to the user's verified active installation.
2. The partial unique index `repositories_one_selected_per_user_idx` enforces the
   one-selection constraint at the database level.
3. The selection mutation performs a two-step atomic update:
   a. Clear the existing selection: `UPDATE repositories SET is_selected = false WHERE user_id = userId AND is_selected = true`.
   b. Set the new selection: `UPDATE repositories SET is_selected = true WHERE id = repositoryRowId AND user_id = userId`.
   Both steps use the admin client and must succeed together, or neither is applied.
   (Supabase does not natively support multi-statement transactions via the JS client;
   use sequential updates and handle rollback manually if the second fails.)
4. The `user_id` is always derived from the authenticated session. It is never
   accepted from the client.
5. The `repository_id` (UUID, FK into `repositories`) is accepted from the client
   but verified on the server: the row must exist with `user_id = userId` and
   `access_status = 'active'` before the update is applied.
6. A removed or unavailable repository cannot be selected.

### Selection Action Result

```ts
type SelectRepositoryResult =
  | { ok: true; repositoryId: string }
  | { ok: false; errorCode: SelectRepositoryErrorCode };

type SelectRepositoryErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_ONBOARDED"
  | "NO_ACTIVE_INSTALLATION"
  | "REPOSITORY_NOT_FOUND"
  | "REPOSITORY_NOT_ACCESSIBLE"
  | "REPOSITORY_REMOVED"
  | "DB_ERROR";
```

---

## Routes and Modules

### Route: `src/app/(app)/github/repositories/page.tsx`

Server Component. Protected by session (proxy). Additional server-side guards:

1. Call `getUser()` — redirect to `/login` if absent.
2. Fetch profile with `onboarding_completed_at` — redirect to `/onboarding` if
   not completed.
3. Query `github_installations` for `user_id = userId AND status = 'active'` —
   redirect to `/github/connect` if none found.
4. If installation `status = 'suspended'` exists but no active one — redirect to
   `/github/connect?error=installation_suspended`.
5. Call `repository-sync.service.ts` to sync and return the current repository list.
6. Pass repositories and installation metadata to `RepositoryList` component.

### Loading: `src/app/(app)/github/repositories/loading.tsx`

Skeleton matching the repository list card layout.

### Module: `src/lib/github/installation-token.ts`

Marked `server-only`.

```ts
export type InstallationTokenResult =
  | { ok: true; token: string }
  | { ok: false; errorCode: "GITHUB_UNAVAILABLE" | "INVALID_INSTALLATION" };

export async function createInstallationToken(
  installationId: number
): Promise<InstallationTokenResult>
```

Steps:
1. Call `createAppOctokit()`.
2. Call `octokit.rest.apps.createInstallationAccessToken({ installation_id })`.
3. On 404 → return `{ ok: false, errorCode: "INVALID_INSTALLATION" }`.
4. On other errors → return `{ ok: false, errorCode: "GITHUB_UNAVAILABLE" }`.
5. Return `{ ok: true, token: response.data.token }`.

The token string is the only field returned. `expires_at` and `permissions` are
not stored or returned. The caller must use the token immediately and not cache it.

### Module: `src/lib/github/repository-list.ts`

Marked `server-only`.

```ts
export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
};

export type RepositoryListResult =
  | { ok: true; repositories: GitHubRepository[] }
  | { ok: false; errorCode: "GITHUB_UNAVAILABLE" };

export async function listInstallationRepositories(
  token: string,
  installationId: number
): Promise<RepositoryListResult>
```

Steps:
1. Create an Octokit instance authenticated with the installation token (Bearer
   token strategy — use `new Octokit({ auth: token })` from `@octokit/rest`).
2. Paginate `octokit.rest.apps.listReposAccessibleToInstallation` with
   `per_page: 100`.
3. Collect all repositories across pages.
4. Return the normalized list with only the fields required by sync.
5. On any error → return `{ ok: false, errorCode: "GITHUB_UNAVAILABLE" }`.

The `token` parameter is used transiently. This module must not log or store it.

### Service: `src/features/github/repository-sync.service.ts`

Marked `server-only`.

```ts
export type RepositorySyncErrorCode =
  | "NO_ACTIVE_INSTALLATION"
  | "INSTALLATION_SUSPENDED"
  | "GITHUB_UNAVAILABLE"
  | "TOKEN_FAILED"
  | "DB_ERROR";

export type SyncedRepository = {
  id: string;               // UUID, PK in repositories table
  github_repository_id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  is_private: boolean;
  is_selected: boolean;
  access_status: string;
};

export type RepositorySyncResult =
  | { ok: true; repositories: SyncedRepository[] }
  | { ok: false; errorCode: RepositorySyncErrorCode };

export async function syncRepositories(
  userId: string
): Promise<RepositorySyncResult>
```

Steps:
1. Using the admin client, query `github_installations` for the active row:
   `user_id = userId AND status = 'active'`.
   - If none → `{ ok: false, errorCode: "NO_ACTIVE_INSTALLATION" }`.
   - If `status = 'suspended'` (and no active) → `{ ok: false, errorCode: "INSTALLATION_SUSPENDED" }`.
2. Call `createInstallationToken(installation.installation_id)`.
   - If not ok → `{ ok: false, errorCode: result.errorCode === "INVALID_INSTALLATION" ? "NO_ACTIVE_INSTALLATION" : "GITHUB_UNAVAILABLE" }`.
3. Call `listInstallationRepositories(token, installation.installation_id)`.
   - Token is passed and used; not stored after this step.
   - If not ok → `{ ok: false, errorCode: "GITHUB_UNAVAILABLE" }`.
4. Upsert each repository into the `repositories` table using the admin client.
   - Conflict key: `(user_id, github_repository_id)`.
   - Write all fields listed in the Data Flow section above.
   - Do not update `is_selected`.
5. Mark removed repositories: update rows for this installation that are no longer
   in the GitHub response to `access_status = 'removed', is_selected = false`.
6. Insert audit log: `action = 'repositories_synced'`.
7. Return `{ ok: true, repositories: <active rows for userId> }`.
   - Select only rows where `user_id = userId` and `access_status != 'removed'`.
   - Order by `full_name ASC`.

**Why admin client for upserts:** The `repositories` table upsert requires a
trusted server boundary because ownership is verified independently (via the GitHub
API and the verified `github_installations` row) rather than through RLS alone.
`getUser()` and profile fetches still use the anon-key server client.

### Service: `src/features/github/repository-selection.service.ts`

Marked `server-only`.

```ts
export async function selectRepository(
  repositoryId: string,   // UUID, PK in repositories table
  userId: string
): Promise<SelectRepositoryResult>
```

Steps:
1. Using the admin client, fetch the repository row:
   `id = repositoryId AND user_id = userId`.
   - If not found → `{ ok: false, errorCode: "REPOSITORY_NOT_FOUND" }`.
   - If `access_status = 'removed'` → `{ ok: false, errorCode: "REPOSITORY_REMOVED" }`.
   - If `access_status` is neither `'active'` nor the row does not exist →
     `{ ok: false, errorCode: "REPOSITORY_NOT_ACCESSIBLE" }`.
2. Verify the repository's `installation_id` (UUID FK) maps to an active
   installation for `userId`:
   - Query `github_installations` where `id = repo.installation_id AND user_id = userId AND status = 'active'`.
   - If not found → `{ ok: false, errorCode: "REPOSITORY_NOT_ACCESSIBLE" }`.
3. Clear existing selection: `UPDATE repositories SET is_selected = false WHERE user_id = userId AND is_selected = true`.
   - If DB error → `{ ok: false, errorCode: "DB_ERROR" }`.
4. Set new selection: `UPDATE repositories SET is_selected = true WHERE id = repositoryId AND user_id = userId`.
   - If DB error → attempt to leave state consistent; log the error; return
     `{ ok: false, errorCode: "DB_ERROR" }`.
5. Insert audit log:
   ```ts
   {
     user_id: userId,
     action: "repository_selected",
     resource_type: "repository",
     resource_id: repositoryId,
     metadata: { full_name: repo.full_name, default_branch: repo.default_branch },
   }
   ```
   Audit failure does not roll back the selection.
6. Return `{ ok: true, repositoryId }`.

### Server Action: `src/features/github/select-repository.actions.ts`

```ts
"use server";

export async function selectRepositoryAction(
  repositoryId: string
): Promise<SelectRepositoryResult>
```

Steps:
1. Call `getUser()` — if null, return `{ ok: false, errorCode: "UNAUTHENTICATED" }`.
2. Call `selectRepository(repositoryId, user.id)`.
3. Return the result.

The `user.id` is always derived from the authenticated session. `repositoryId` is
the only client-provided value and is validated server-side by the service.

### Component: `src/features/github/RepositoryList.tsx`

Client Component (`"use client"`). Receives:

```ts
interface RepositoryListProps {
  repositories: SyncedRepository[];
  currentSelectionId: string | null;
}
```

Renders the repository list. For each repository:
- Full name (`owner/name`).
- Private badge if `is_private`.
- Default branch name.
- Select button (disabled if already selected or if `access_status !== 'active'`).
- Selected indicator when `is_selected`.

On select button click:
1. Set a pending state for the row.
2. Call `selectRepositoryAction(repository.id)`.
3. On success: reload the page or update local state to reflect the new selection.
4. On failure: display a row-level error message.

Handles states: loading, empty, error per row, global success, repository removed.

---

## UI States

| State | Trigger | Display |
|---|---|---|
| Loading | Page initial load | Skeleton cards matching repository row height |
| No installation | No active `github_installations` row | "Connect GitHub" card with link to `/github/connect` |
| Installation suspended | `status = 'suspended'` | Warning banner; "Contact GitHub to restore" copy; link to GitHub settings |
| No accessible repositories | GitHub returns 0 repos | Empty state with explanation and link back to GitHub App settings |
| Repository list | Repositories returned | Scrollable list of repository cards |
| Selected repository | `is_selected = true` on a row | Highlighted card; "Selected" badge; checkmark |
| Private indicator | `is_private = true` | Small "Private" badge beside the repo name |
| Sync error | `syncRepositories` returns error | Error banner with "Try again" action that re-fetches |
| GitHub unavailable | Token or list call fails | "GitHub is temporarily unavailable. Try again." banner |
| Selection success | `selectRepositoryAction` returns ok | Row updates to selected state; no full-page redirect |
| Repository removed | `access_status = 'removed'` | Greyed-out row; "Access removed" label; non-selectable |
| Reconnect path | No active installation on any attempt | Prominent "Reconnect GitHub App" CTA linking to `/github/connect` |

---

## Dashboard Integration

Update `src/features/dashboard/GitHubConnectionCard.tsx`:

- Query `repositories` for `user_id = userId AND is_selected = true AND access_status = 'active'` on the dashboard server load.
- If a selected repository exists, render:
  - Repository `full_name` as a link to the GitHub repository page.
  - `default_branch` label.
  - "Active" connection badge using `--state-success` colour.
  - "Manage repositories" link to `/github/repositories`.
- If no selected repository but an active installation exists, render:
  - "Installation connected" note.
  - "Select a repository →" link to `/github/repositories`.
- If no installation at all, render the existing not-connected state with the
  "Connect GitHub →" link to `/github/connect` (unchanged from Unit 07).

This requires the dashboard service (`dashboard.service.ts`) to accept and pass
the `selectedRepository` result to `GitHubConnectionCard`. The `DashboardShell`
and `GoalSummaryCard` components are not changed.

---

## Environment Variables

No new variables are required. All GitHub App variables were added in Unit 06.

---

## File Structure

```
src/
├── app/
│   └── (app)/
│       └── github/
│           └── repositories/
│               ├── page.tsx         ← new (Server Component)
│               └── loading.tsx      ← new (skeleton)
├── features/
│   └── github/
│       ├── RepositoryList.tsx               ← new (Client Component)
│       ├── select-repository.actions.ts     ← new (Server Action)
│       ├── repository-sync.service.ts       ← new
│       ├── repository-sync.service.test.ts  ← new
│       ├── repository-selection.service.ts  ← new
│       └── repository-selection.service.test.ts ← new
└── lib/
    └── github/
        ├── installation-token.ts            ← new
        ├── installation-token.test.ts       ← new
        ├── repository-list.ts               ← new
        └── repository-list.test.ts          ← new
```

Existing files changed:

```
src/features/dashboard/GitHubConnectionCard.tsx   ← updated (connected state)
src/features/dashboard/dashboard.service.ts        ← updated (selected repo query)
src/proxy.ts                                       ← no change needed (/github already protected)
```

---

## Security Rules for This Unit

1. **Installation token is never stored.** The token string must not appear in the
   database, cookies, response JSON, client component props, or log output.
2. **Token generation is server-only.** `installation-token.ts` is marked
   `server-only`. The token is never passed to the browser.
3. **`user_id` is always from the session.** The Server Action and service both
   derive `userId` from `getUser()`, never from the client request body or URL.
4. **Repository ownership is verified before selection.** The service confirms
   `user_id = userId` on the repository row before writing `is_selected = true`.
5. **Installation relationship is verified before selection.** The repository's
   `installation_id` FK must map to an active installation owned by the same user.
6. **Removed repositories cannot be selected.** The service checks
   `access_status = 'active'` before applying the selection update.
7. **Suspended installations are rejected.** The sync service checks
   `status = 'active'` on the installation before generating a token.
8. **Organization installations remain unsupported.** No org membership check is
   implemented. If an org installation somehow exists in `github_installations`,
   `account_type = 'Organization'` is ignored; no repositories should be found
   under a personal-account-only app. Do not add org support in this unit.
9. **Admin client scope is minimal.** Used only for: upsert/update of `repositories`,
   update of `github_installations` (not required here), and `audit_logs` insert.
   `getUser()` and profile queries still use the anon-key server client.
10. **No source code is read.** The only GitHub API calls are token creation and
    the repository listing endpoint. No repository contents, trees, commits, or
    file reads are performed.
11. **Provider errors are sanitized.** Octokit error messages are not forwarded
    to the browser. Error codes are mapped to safe internal codes before returning.
12. **Redirect targets are hard-coded.** No query parameter is used as a redirect
    destination.

---

## Database Behaviour

### Table: `repositories`

No migration is needed. The table was created in Unit 03. Confirm existing columns
match what is written:

| Column | Written by Unit 08 |
|---|---|
| `user_id` | ✓ |
| `installation_id` | ✓ (UUID FK) |
| `github_repository_id` | ✓ |
| `owner` | ✓ |
| `name` | ✓ |
| `full_name` | ✓ |
| `default_branch` | ✓ |
| `is_private` | ✓ |
| `is_selected` | ✓ (by selection action; NOT during sync) |
| `access_status` | ✓ (`'active'` on sync; `'removed'` when absent) |
| `last_synced_at` | ✓ |

### RLS Expectations

User-facing `SELECT` on `repositories` uses `user_id = auth.uid()` (anon client).
Writes (upsert, update) use the admin client after server-side ownership
verification, consistent with the pattern established in Unit 07 for
`github_installations`.

### Unique Constraints

- `(user_id, github_repository_id)` — enforced by database constraint; upsert
  uses this as the conflict key.
- `repositories_one_selected_per_user_idx` — partial unique index enforces at most
  one `is_selected = true AND access_status = 'active'` row per user.

---

## Tests

### Location

```
src/lib/github/installation-token.test.ts
src/lib/github/repository-list.test.ts
src/features/github/repository-sync.service.test.ts
src/features/github/repository-selection.service.test.ts
```

### Required Test Cases

| # | File | Scenario | Expected result |
|---|---|---|---|
| 1 | `installation-token.test.ts` | `createInstallationToken` with a valid installation ID | Returns `{ ok: true, token: "<string>" }` |
| 2 | `installation-token.test.ts` | GitHub returns 404 for installation | Returns `{ ok: false, errorCode: "INVALID_INSTALLATION" }` |
| 3 | `installation-token.test.ts` | GitHub returns an unexpected error | Returns `{ ok: false, errorCode: "GITHUB_UNAVAILABLE" }` |
| 4 | `repository-list.test.ts` | Lists repositories for a valid token | Returns `{ ok: true, repositories: [...] }` |
| 5 | `repository-list.test.ts` | GitHub returns an empty list | Returns `{ ok: true, repositories: [] }` |
| 6 | `repository-list.test.ts` | GitHub API throws error | Returns `{ ok: false, errorCode: "GITHUB_UNAVAILABLE" }` |
| 7 | `repository-list.test.ts` | Paginates correctly when total_count > 100 | All pages are collected |
| 8 | `repository-sync.service.test.ts` | No active installation for user | Returns `NO_ACTIVE_INSTALLATION` |
| 9 | `repository-sync.service.test.ts` | Installation is suspended | Returns `INSTALLATION_SUSPENDED` |
| 10 | `repository-sync.service.test.ts` | Valid installation; GitHub returns repos | Returns `{ ok: true, repositories: [...] }` and upserts rows |
| 11 | `repository-sync.service.test.ts` | Repository no longer in GitHub response | That row is marked `access_status = 'removed'` |
| 12 | `repository-sync.service.test.ts` | Token generation fails | Returns `TOKEN_FAILED` or `GITHUB_UNAVAILABLE` |
| 13 | `repository-sync.service.test.ts` | DB upsert fails | Returns `DB_ERROR` |
| 14 | `repository-sync.service.test.ts` | Sync is called twice (idempotent) | Returns `{ ok: true }`, no duplicate rows |
| 15 | `repository-selection.service.test.ts` | Valid repository selection | Returns `{ ok: true }`, `is_selected = true` |
| 16 | `repository-selection.service.test.ts` | Repository does not belong to user | Returns `REPOSITORY_NOT_FOUND` |
| 17 | `repository-selection.service.test.ts` | Repository has `access_status = 'removed'` | Returns `REPOSITORY_REMOVED` |
| 18 | `repository-selection.service.test.ts` | Repository's installation is suspended | Returns `REPOSITORY_NOT_ACCESSIBLE` |
| 19 | `repository-selection.service.test.ts` | Selecting a new repo clears the previous selection | Previous `is_selected` is set to false |
| 20 | `repository-selection.service.test.ts` | DB error on clearing old selection | Returns `DB_ERROR` |
| 21 | `repository-selection.service.test.ts` | Audit failure on successful selection | Returns `{ ok: true }` (audit is non-blocking) |

### Test Patterns

All test files must mock `server-only`:

```ts
vi.mock("server-only", () => ({}));
```

All test files must mock `@/lib/env/server` to avoid triggering env validation:

```ts
vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
    SUPABASE_SECRET_KEY: "test-service-key",
    GITHUB_APP_ID: "1234567",
    GITHUB_APP_SLUG: "blumo-development",
    GITHUB_APP_PRIVATE_KEY:
      "-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----\n",
    GITHUB_WEBHOOK_SECRET: undefined,
    GITHUB_APP_CLIENT_ID: undefined,
    GITHUB_APP_CLIENT_SECRET: undefined,
  },
}));
```

`installation-token.test.ts` mocks `@/lib/github/app-auth` and `@octokit/rest`:

```ts
vi.mock("@/lib/github/app-auth", () => ({ createAppOctokit: vi.fn() }));
```

`repository-list.test.ts` mocks `@octokit/rest` to avoid real network calls:

```ts
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    paginate: vi.fn(),
    rest: {
      apps: {
        listReposAccessibleToInstallation: vi.fn(),
      },
    },
  })),
}));
```

`repository-sync.service.test.ts` mocks:

```ts
vi.mock("@/lib/github/installation-token");
vi.mock("@/lib/github/repository-list");
vi.mock("@/lib/supabase/admin");
```

`repository-selection.service.test.ts` mocks:

```ts
vi.mock("@/lib/supabase/admin");
```

### Minimum New Tests

21 new tests. Total after Unit 08: **75+**.

---

## What Is Not Changed

- SQL migrations — no new tables or columns required.
- `github_installations` table — Unit 08 reads but does not modify installation
  metadata (suspensions and deletions are handled in Unit 09 webhook processing).
- `src/lib/github/app-auth.ts` — `createAppOctokit()` is reused unchanged.
- `src/lib/github/github-app.config.ts` — unchanged.
- `src/lib/github/installation-lookup.ts` — not needed in this unit.
- `src/app/api/github/setup/route.ts` — unchanged.
- `src/proxy.ts` — `/github` is already protected; no further change needed for
  the `/github/repositories` sub-path.
- Onboarding, auth, and marketing modules.
- Commit, task, AI, email, and scheduling modules.

---

## Data Flow Diagram

```
Browser → GET /github/repositories
                │
          page.tsx (Server Component)
                │
        ┌───────┴────────────────────────┐
        │                                │
   getUser()                       getProfile()
  (anon client)                   (anon client)
        │
   Check active installation
   (admin client — read github_installations)
        │
   syncRepositories(userId)
        │
   createInstallationToken(installationId)
   (App JWT → POST /app/installations/{id}/access_tokens)
        │
   listInstallationRepositories(token, installationId)
   (GET /installation/repositories — token used, then discarded)
        │
   Upsert into repositories (admin client)
        │
   Mark removed rows
        │
   Insert audit_logs
        │
   Return SyncedRepository[]
                │
          RepositoryList (Client Component)
                │
       User clicks "Select"
                │
       selectRepositoryAction(repositoryId)
         (Server Action)
                │
       selectRepository(repositoryId, userId)
         │
         Verify ownership + access_status (admin client)
         │
         Verify installation still active (admin client)
         │
         Clear previous selection (admin client)
         │
         Set new selection (admin client)
         │
         Insert audit_logs
         │
         Return { ok: true, repositoryId }
                │
          RepositoryList reflects selection
```

---

## Verification Checklist

- [ ] `src/lib/github/installation-token.ts` is marked `server-only` and generates
  an installation token scoped to the verified installation ID.
- [ ] The installation token is never stored in the database, cookie, or response
  body.
- [ ] The installation token is never logged or returned to any client code.
- [ ] `src/lib/github/repository-list.ts` is marked `server-only` and uses the
  token transiently.
- [ ] `src/features/github/repository-sync.service.ts` is marked `server-only`.
- [ ] `syncRepositories` upserts repositories with the correct conflict key
  `(user_id, github_repository_id)`.
- [ ] `syncRepositories` does not update `is_selected` during upsert.
- [ ] Repositories absent from the GitHub response are marked `access_status = 'removed'`
  with `is_selected = false`.
- [ ] `default_branch` is read from GitHub and never assumed to be `main`.
- [ ] `src/features/github/repository-selection.service.ts` is marked `server-only`.
- [ ] `selectRepository` verifies `user_id` ownership before writing `is_selected`.
- [ ] `selectRepository` verifies the repository's installation is active for the
  same user before applying the selection.
- [ ] Selecting a new repository clears any previous `is_selected = true` row for
  the same user.
- [ ] A removed (`access_status = 'removed'`) repository cannot be selected.
- [ ] `selectRepositoryAction` derives `userId` from the authenticated session, not
  the client.
- [ ] `src/app/(app)/github/repositories/page.tsx` redirects to `/github/connect`
  if no active installation exists.
- [ ] `src/app/(app)/github/repositories/page.tsx` renders the correct error state
  for a suspended installation.
- [ ] `RepositoryList` renders all required UI states: loading, empty, list,
  selected, removed, error.
- [ ] `GitHubConnectionCard` on the dashboard shows the selected repository name
  and "Manage repositories" link when a selection exists.
- [ ] `GitHubConnectionCard` shows "Select a repository" link when installation
  exists but no repository is selected.
- [ ] `GitHubConnectionCard` shows the existing "not connected" state when no
  installation exists.
- [ ] No fake or hardcoded repository data is shown.
- [ ] Audit events are recorded for sync and selection operations.
- [ ] Admin client is used only for trusted server writes; anon client is used for
  `getUser()` and profile queries.
- [ ] `npm run lint` passes with no errors.
- [ ] `npm run typecheck` passes with no errors.
- [ ] `npm run test` passes (75+ total, 21+ new tests).
- [ ] `npm run build` passes with no errors.
- [ ] `context/progress-tracker.md` is updated to record Unit 08 complete.

---

## What Comes Next

Unit 09 implements the GitHub webhook lifecycle. After Unit 08 stores installation
and repository metadata, Unit 09:

1. Accepts `POST /api/github/webhook` with raw-body HMAC signature verification.
2. Handles `installation` events: `created`, `suspended`, `unsuspended`, `deleted`.
3. Handles `installation_repositories` events: `added`, `removed`.
4. Updates `github_installations.status` on suspension/deletion.
5. Updates `repositories.access_status` on repository removal.
6. Marks `is_selected = false` on repositories that lose access.
7. Records idempotent audit events keyed on the GitHub delivery ID.

Unit 09 requires `GITHUB_WEBHOOK_SECRET` to be non-empty. The env schema optional
marker for that variable must be changed to `.min(1)` before Unit 09 implementation.
