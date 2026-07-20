# Unit 12: Approved Mission GitHub Commit

## Status and Scope Authority

This is a planning specification only. It must be reviewed and merged before any
Unit 12 application code or migration is implemented.

This document is the authoritative scope for Unit 12. It defines the complete
flow from an approved Blumo mission to one user-confirmed GitHub commit: commit
proposal, safe-path enforcement, branch creation, GitHub write, database
recording, idempotency, and all associated UI states. It does not authorize the
Unit 12 task workspace (Markdown editor), pull-request creation, automatic
merging, direct default-branch commits, or any later-unit work.

---

## 1. Goal

Convert an approved mission into one user-confirmed GitHub commit. The commit
creates a single new Markdown file inside the `blumo/**` directory of the user's
selected repository on a dedicated mission branch. The user must explicitly
confirm the exact proposed branch, file path, file content, and commit message
before any GitHub write occurs. Approval is a fresh server-validated action;
a client-side flag is never sufficient.

At the end of Unit 12, the authenticated owner of an approved mission can:

- open the commit proposal page for their approved mission;
- review the proposed branch name, file path, complete file content, and commit
  message — all derived from stored mission data and owned database state;
- cancel without any GitHub write occurring;
- confirm the commit and observe a success screen that links to the GitHub
  commit; and
- repeat the confirmation without creating a duplicate commit.

No GitHub write occurs before the user confirms the exact proposal. Repository
contents are not read or sent to the AI provider. No pull request is created.
No default-branch commit is made.

### Dependencies

- Unit 11 is complete, manually verified, and merged.
- An approved mission exists in `daily_tasks` with `status = 'approved'` and
  a non-null `current_mission_version_id` pointing to an approved
  `mission_versions` row.
- A selected active repository and active GitHub installation exist in the
  database for the user.
- `src/lib/github/installation-token.ts` can create short-lived installation
  tokens (implemented in Unit 08).
- The `commits` table exists with RLS enabled (created in Unit 03).
- GitHub Contents read/write permission is active on the installation
  (configured in Unit 06/07 and verified in the `docs/github-app-setup.md`
  setup guide).

### Included Scope

- An authenticated commit proposal route and loading/error states.
- A server-only read model that derives the proposal from owned database data.
- Safe-path normalization and validation enforced entirely on the server.
- Branch-name normalization and server-side branch creation using the verified
  default-branch SHA.
- Commit content sourced from the approved mission version's validated fields.
- A server-only GitHub write flow: token generation, branch creation, optional
  existing-file detection, file creation or update, and safe result capture.
- An idempotent commit Server Action using a server-generated operation ID.
- A service-role-only atomic database function that records the commit, updates
  the task status, and writes a sanitized audit event in one transaction.
- Handling for first-time creation and Blumo-managed file updates.
- UI states: proposal, confirming, success, already-committed, repository
  unavailable, installation suspended, branch conflict, file conflict, GitHub
  unavailable, invalid safe path, permission changed, and recoverable failure.
- Rate limiting and duplicate-request protection for the commit action.
- Schema, service, action, GitHub library, and UI tests.

---

## 2. Product Decisions

### Commit First, Editor Later

Unit 12 ships the full approved-mission-to-commit flow without a Markdown
editor. The file content is derived directly from the approved mission version's
validated AI output fields: the title, description, acceptance checklist, and
learning outcome are combined into a Markdown document by a server-side
formatter. The user sees the complete proposed file content in the proposal panel
before confirming.

Editable Markdown, a live preview pane, and path customization remain explicitly
deferred to a later workspace unit. Unit 12 does not add those capabilities and
must not leave placeholders or partially wired entry points for them.

### No Pull Request in Unit 12

Unit 12 creates a branch and commits the file directly on that branch. It does
not open a pull request. Pull-request creation requires an additional GitHub App
permission (`pull_requests: write`) and is a separate, explicitly reviewed unit.
Do not call any pull-request GitHub API endpoint in Unit 12.

### Dedicated Mission Branch

Every successful mission commit lands on a dedicated branch derived from the
mission title and scheduled date. The branch is created from the current
default-branch SHA at commit time; it is never a force-push and never targets
the default branch directly. The user is shown the exact branch name before
confirmation.

### Content Is AI-Generated and Clearly Labelled

The file content is derived from AI-validated mission fields and is clearly
labelled as AI-generated in the proposal panel. It is rendered as escaped text
in the preview and is never executed or used as a system command.

---

## 3. Preconditions

All of the following must be true at the moment the Server Action executes. The
server must re-verify each condition independently; it must not trust
client-supplied values for any of them.

| Condition | Verified by |
| --- | --- |
| User is authenticated and onboarded | Server session |
| Task belongs to the authenticated user | RLS read + `user_id` check |
| Task `status = 'approved'` | Loaded task row |
| `current_mission_version_id` is non-null and version status is `approved` | Loaded version row |
| Task has no existing successful commit record | `commits` table lookup by `task_id` |
| Selected repository exists, `is_selected = true`, `access_status = 'active'` | Loaded repository row |
| GitHub installation `status = 'active'` | Loaded installation row |
| Repository belongs to the same user and installation | Cross-table ownership check |

If any condition fails, the action must return a typed failure code and must not
call the GitHub API or write any commit record.

---

## 4. Commit Proposal

### Route

Use an authenticated route equivalent to:

```text
/tasks/[taskId]/commit
```

The `taskId` route parameter is an untrusted identifier. The Server Component
must validate it as a UUID, load the task through the owner-scoped RLS client,
verify the preconditions above, and compute the proposal fields entirely from
stored owned database data. The page must never accept a proposed branch, path,
content, or commit message from the client.

### Proposal Fields

The Server Component derives and passes to the presentation component:

| Field | Source |
| --- | --- |
| Repository full name | `repositories.full_name` — owned database row |
| Base branch name | `repositories.default_branch` — owned database row; never assumed to be `main` |
| Proposed branch name | Normalized from mission title and `daily_tasks.scheduled_date` (see §5) |
| Proposed file path | Normalized from mission title and `daily_tasks.scheduled_date` (see §5) |
| Complete proposed file content | Server-formatted Markdown from approved mission version fields (see §5) |
| Commit message | `mission_versions.suggested_commit_message` from the approved version, validated to 5–100 characters |
| Mission title | `mission_versions.title` — displayed as context, not written to file metadata |
| Generation date | `daily_tasks.scheduled_date` |
| AI-generated notice | Static text; always shown |

The presentation component receives only these derived fields. It does not
receive internal IDs (installation ID, GitHub repository ID, account ID),
provider metadata, AI usage records, rejection reasons, or any other internal
value.

### Proposal Page Content

Show:

- a visible **AI-generated content** label and explanation that this file was
  produced from saved learning preferences, not repository inspection;
- a notice that confirming will create a branch and file on GitHub, not
  directly on the default branch, and that no pull request will be opened
  automatically;
- repository full name;
- base branch (the repository's stored default branch);
- proposed branch name;
- proposed file path;
- complete proposed file content in a read-only code-styled panel;
- commit message;
- an accessible **Confirm and commit** primary action; and
- a **Cancel** secondary action that navigates away without any GitHub write.

The full file content must always be visible before the confirmation button. Do
not hide it behind a toggle or tab. Render it as escaped static text in a `<pre>`
or code panel; never execute it or treat it as HTML.

### Server-Generated Operation ID

Before rendering the confirmation form, the Server Component generates a
server-side operation ID (a UUID). This ID is included in the hidden form fields
and passed to the Server Action for idempotency. The same task cannot produce
two successful commits even if two tabs submit simultaneously — the database
function enforces this. The operation ID is an additional replay guard at the
action layer.

---

## 5. Safe File Boundary and Content Generation

### Path Construction

The proposed file path is constructed server-side as:

```text
blumo/<normalized-date>-<normalized-title>.md
```

Where:

- `<normalized-date>` is `daily_tasks.scheduled_date` in `YYYY-MM-DD` format.
- `<normalized-title>` is a URL-safe slug derived from the mission title: Unicode
  normalized to NFC, lowercased, diacritics stripped, non-alphanumeric characters
  (except hyphens) replaced with hyphens, consecutive hyphens collapsed, leading
  and trailing hyphens removed, and the result truncated to 60 characters.
- The full path must be under `blumo/` and must not exceed 240 characters.
- The path must pass the safe-path validator immediately before the GitHub API
  call (see §5.2).

Example:

```text
blumo/2026-07-20-practice-state-transitions.md
```

### Safe-Path Validation

Path validation runs server-side immediately before the GitHub API call. The
validator must enforce all rules from `context/security-model.md`:

Reject:

- paths that do not begin with `blumo/`;
- absolute paths (beginning with `/`);
- paths containing `..` in any segment;
- paths containing null bytes;
- paths containing backslashes;
- paths with URL-encoded traversal sequences after decoding (e.g. `%2F`, `%2e%2e`);
- empty paths or paths that are blank after trimming;
- paths matching `.git/**`, `.github/**`, `.env`, `.env.*`;
- paths matching `node_modules/**`, `credentials/**`, `credential/**`,
  `secrets/**`, `secret/**`, `keys/**`, `key/**`, `certificates/**`,
  `infrastructure/**`;
- paths over 240 characters; and
- paths whose final component begins with `.` (hidden files in the root).

Never trust a client-submitted path. Always recompute the path server-side from
owned database values and validate the recomputed result.

### Branch Name Construction

The proposed branch name is constructed server-side as:

```text
blumo/<normalized-date>-<normalized-title>
```

Using the same date and title slug rules as the file path, but without a file
extension. The branch name must:

- begin with `blumo/`;
- not exceed 250 characters;
- contain only alphanumeric characters, hyphens, forward slashes, and underscores;
- not contain consecutive slashes;
- not begin or end with a slash or hyphen; and
- be generated entirely from owned stored data, never from client input.

Example:

```text
blumo/2026-07-20-practice-state-transitions
```

### Content Formatter

The Markdown file content is assembled server-side from the approved
`mission_versions` snapshot:

```markdown
# <title>

> AI-generated mission · <scheduled_date> · <ai_provider>

## What you will do

<description>

## Acceptance checklist

- <checklist item 1>
- <checklist item 2>
...

## Learning outcome

<learning_outcome>
```

Rules:

- All fields are sourced exclusively from the approved `mission_versions` row;
  no field comes from client input.
- Every string is rendered as escaped Markdown text; no raw HTML or code execution.
- The formatter must not add repository paths, filenames, shell commands,
  credentials, or any text that is not a direct validated mission field.
- Maximum total content size: 10 KB (enforced on the server before the GitHub
  API call). If the assembled content exceeds this limit, the action must return
  a typed failure code (`content_too_large`) and must not call the GitHub API.

---

## 6. Branch Behaviour

### Create a Dedicated Branch

1. Retrieve the base branch reference using the GitHub API:
   `GET /repos/{owner}/{repo}/git/refs/heads/{base_branch}`.
2. Extract the current HEAD SHA of the base branch.
3. Create the mission branch from that exact SHA:
   `POST /repos/{owner}/{repo}/git/refs`
   with `ref: "refs/heads/<branch_name>"` and `sha: <head_sha>`.

### Branch Conflict Handling

If the branch already exists (GitHub returns HTTP 422 with a message indicating
the reference already exists):

- Check whether the existing branch has exactly one commit that matches the
  current task's `commits.github_commit_sha` if a successful commit record
  already exists. If so, treat as idempotent (already committed) and return
  `already_committed`.
- If no successful commit record exists for this task, return a typed
  `branch_conflict` failure code. Do not force-push or delete the existing
  branch. The user must resolve the conflict or choose a different path.

### Never Force-Push

Under no circumstances may the commit action force-push a branch, delete a
branch, or overwrite a branch that was not created by this task. A
`branch_conflict` error must be returned instead.

### Never Commit to the Default Branch

The Server Action must verify that the constructed branch name differs from the
repository's stored `default_branch` before making any GitHub API call. If they
match, the action must return `invalid_branch` and must not proceed.

---

## 7. GitHub Write Flow

The GitHub write happens entirely server-side in the following order:

1. **Pre-write precondition check** — re-run every precondition in §3. Abort if
   any fails. Do not call the GitHub API before this check passes.
2. **Safe-path validation** — validate the recomputed path against the full
   blocklist. Abort if rejected.
3. **Content validation** — verify the assembled content is within 10 KB.
4. **Generate an installation token** — call `createInstallationToken` with the
   numeric GitHub installation ID. The token must be used immediately and must
   not be stored, logged, or returned to the client. If token generation fails,
   return `github_unavailable`.
5. **Fetch the base branch reference** — call the GitHub API with the
   installation token. If the base branch is not found, return
   `repository_unavailable`. Extract the HEAD SHA.
6. **Check for an existing file** — call
   `GET /repos/{owner}/{repo}/contents/{path}` at the target path. Capture the
   existing file's SHA blob if one is found. Define the safe behaviour:
   - If no file exists: create a new file using `PUT /repos/{owner}/{repo}/contents/{path}` without a `sha` field.
   - If a file exists and its path is inside `blumo/**` and it was last committed
     by the Blumo App installation: update the file using `PUT` with the captured
     `sha` blob.
   - If a file exists and cannot be confirmed as Blumo-managed: return
     `file_conflict`. Do not overwrite.
   - Any API error during the file check: return `github_unavailable`.
7. **Create the branch** — call the GitHub API to create the branch from the
   base SHA. Handle branch-conflict per §6.
8. **Commit the file** — call `PUT /repos/{owner}/{repo}/contents/{path}` with:
   - `message`: the validated commit message;
   - `content`: the Base64-encoded UTF-8 file content;
   - `branch`: the mission branch name; and
   - `sha` (only when updating an existing file).
   Capture the response's `commit.sha`, `commit.html_url`, `commit.message`,
   and `content.sha`.
9. **Record the commit** — call the atomic database function (§8) with the
   captured values. If the database write fails after a successful GitHub commit,
   the function must record a `reconciliation_required` status rather than
   silently discarding the SHA. Do not retry the GitHub write; reconcile the
   database record instead.

### Token Usage Rules

- Generate the installation token immediately before step 4.
- Pass it only to Octokit within the same server-side call scope.
- Never assign it to a module-level variable, database column, log entry,
  response body, or client prop.
- The token is discarded at the end of the request.

---

## 8. User Confirmation and Idempotency

### Server Action

Use a Server Action for the confirmation mutation. It must:

1. Retrieve the authenticated Supabase user server-side.
2. Parse a strict Zod input schema that accepts only:
   - `taskId` (UUID);
   - `operationId` (UUID, server-generated and passed through a hidden field); and
   - Next.js `$ACTION_*` transport metadata (ignored).
3. Reject any additional fields.
4. Derive `user_id` from the session; never from form data.
5. Re-verify all preconditions (§3).
6. Proceed to the GitHub write flow (§7).
7. Return a fixed discriminated result.
8. Revalidate affected routes only after a committed database mutation.

The browser submits only `taskId` and `operationId`. It never submits or
controls: `user_id`, `repository_id`, `installation_id`, owner, branch, path,
file content, SHA values, commit message, or any GitHub identifier.

### Idempotency

- The `commits` table has a unique constraint on `task_id`. A second successful
  insertion for the same task is rejected by the database.
- The atomic database function checks for an existing successful commit record
  before inserting. If one exists, it returns `already_committed` without
  writing to GitHub again.
- The `operationId` provides an additional request-level replay guard; the action
  records it alongside the commit and rejects a second submission of the same ID.
- Simultaneous requests for the same task serialize on the task row lock inside
  the database function.

### Concurrent Request Protection

The atomic database function must lock the task row before checking for an
existing commit. Two concurrent submissions can produce at most one successful
commit. The second receives `already_committed` or `in_progress`.

### Confirmation UX

- Disable the **Confirm and commit** button while the action is pending.
- Set `aria-busy=true` on the confirmation region.
- Show a stable loading indicator and **Creating commit…** label.
- Do not allow double-submission in the same client session by tracking the
  pending state locally; rely on server-side idempotency for correctness.

---

## 9. Database Behaviour

### Atomic Commit Function

Add a service-role-only, fixed-`search_path` function equivalent to
`record_mission_commit`. In one transaction it must:

1. Lock the owned task row.
2. Verify `task_id`, `user_id`, and task `status = 'approved'`.
3. Verify no successful commit record exists for this task.
4. Insert one row into `commits` with the captured GitHub values.
5. Set `daily_tasks.status = 'completed'`.
6. Set `daily_tasks.completed_at = transaction_timestamp()`.
7. Insert one sanitized `mission_committed` audit event.

The function must be `security definer`, use a fixed `search_path`, revoke
execution from `public`, `anon`, and `authenticated`, and be callable only from
the trusted server boundary after independent authentication.

If the GitHub write succeeded but the database transaction fails, the function
must record status `reconciliation_required` in the `commits` row (or in a
separate reconciliation marker) so the mismatch is detectable without silently
discarding a valid GitHub commit SHA.

### `commits` Table Additions

The existing `commits` table is used without schema changes. Verify that the
following columns are populated on successful write:

| Column | Value |
| --- | --- |
| `user_id` | Authenticated user UUID |
| `task_id` | Task UUID |
| `repository_id` | Repository UUID from owned database row |
| `github_commit_sha` | Captured from GitHub API response |
| `github_commit_url` | Captured from GitHub API response |
| `branch` | Mission branch name |
| `file_path` | Validated path |
| `commit_message` | Validated commit message |
| `content_snapshot` | Exact UTF-8 content written to GitHub |
| `status` | `created` on success; `reconciliation_required` if post-GitHub DB failure |

If the `commits` table is missing the `content_snapshot` column or the
`reconciliation_required` status value, add a migration (next unused ordered
number after 17) to extend it. Do not modify migrations that have already been
applied to a shared environment.

### `daily_tasks` Status Transition

The only status transition Unit 12 performs on `daily_tasks` is:

```text
approved → completed
```

No other transition is valid for Unit 12. This transition happens atomically
inside the database function after the GitHub commit SHA is confirmed. The task
must not enter `in_progress`, `committing`, or any intermediate state in Unit 12.

### Audit Event

Write one `mission_committed` audit event with:

- `user_id`: authenticated owner UUID;
- `action`: `'mission_committed'`;
- `resource_type`: `'task'`;
- `resource_id`: `task_id`;
- `metadata`: allowlisted object containing only `scheduled_date`, `branch`,
  `file_path`, `version_number`, `result_code`. Never include the commit SHA,
  file content, commit message, installation ID, provider errors, or tokens.

### Required Migration

If any schema addition is needed (e.g., adding `content_snapshot` or
`reconciliation_required` to `commits`, or adding the `record_mission_commit`
function), create the next ordered migration file
(`20240001000018_mission_commit.sql` or the next available number). Do not edit
applied migrations. Enable RLS and revoke browser execution privileges in the
same migration.

---

## 10. UI States

All states follow the existing light-first tokens, responsive app shell, card
radius, focus ring, and accessible form conventions from `context/ui-context.md`.

### Proposal (Ready for Confirmation)

- Show all required proposal fields (§4).
- Show AI-generated content notice and no-pull-request explanation.
- Show enabled **Confirm and commit** button and accessible **Cancel** link.
- Show the complete file content in a read-only `<pre>` panel before the button.

### Confirming

- Disable **Confirm and commit** and show **Creating commit…**.
- Set `aria-busy=true` on the commit region.
- Show a stable accessible loading indicator.
- Prevent double-submission.

### Success

- Announce **Commit created.** via `role=status` / `aria-live`.
- Show a link to the GitHub commit URL (opens in a new tab with `rel="noopener noreferrer"`).
- Show the branch name, file path, and commit SHA (first 8 characters) as
  escaped text.
- Update the task status display to **Completed**.
- Link back to the dashboard.
- Hide the confirmation form.

### Already Committed

- Show **This mission has already been committed.** with the commit SHA, branch,
  and a link to GitHub.
- Do not show the confirmation form again.

### Repository Unavailable

- Disable the confirmation form.
- Explain that repository access must be restored before committing.
- Link to `/github/repositories`.
- History and proposal fields remain readable.

### Installation Suspended

- Disable the confirmation form.
- Explain that GitHub access is suspended.
- Link to GitHub settings.
- Do not imply the mission was deleted.

### Branch Conflict

- Explain that the proposed branch already exists and could not be used.
- Show the conflicting branch name.
- Offer a **Retry** option only when limits allow.
- Do not offer force-push. Do not show internal error details.

### File Conflict

- Explain that a file already exists at the proposed path that could not be
  confirmed as Blumo-managed.
- Show the proposed path.
- Do not reveal file contents. Do not overwrite automatically.

### GitHub Unavailable

- Keep proposal fields readable.
- Show a fixed safe message based on normalized error category.
- Offer retry only when idempotency and limits permit.
- Never show GitHub API error body, installation token, or raw response.

### Invalid Safe Path

- This state should not occur in normal operation since the path is derived
  server-side, but if safe-path validation fails unexpectedly:
  - Return an error screen explaining that the proposed path could not be used.
  - Do not show the invalid path value.
  - Provide a link to the dashboard.

### Permission Changed

- Shown when the GitHub API returns a permissions error (403) during the write.
- Explain that GitHub App permissions may have changed.
- Link to `/github/connect` to reconnect.

### Recoverable Failure

- Shown for any transient GitHub error (network timeout, 5xx response).
- Keep the proposal intact.
- Offer retry only when the commit was not yet recorded as successful.
- Do not show raw GitHub error messages.

### Loading and Error Boundaries

- Add a route-level loading skeleton matching the proposal layout shape.
- Use `role=status` / `aria-live` for asynchronous state changes.
- Use `role=alert` for actionable failures.
- Verify mobile single-column layout and comfortable touch targets.

---

## 11. Security Requirements

- No GitHub write before explicit user confirmation of the exact proposal.
- No GitHub write before all preconditions are re-verified server-side.
- Installation tokens are generated only on the server, used immediately, and
  never stored, logged, or returned to the client.
- `user_id` is always derived from the authenticated server session.
- Branch, path, and file content are computed entirely from owned database data;
  they are never accepted from client input.
- Safe-path validation runs on the server immediately before the GitHub API call,
  regardless of what the client displays.
- The confirmation form accepts only `taskId` and `operationId`; all other fields
  are rejected.
- Task ownership, repository ownership, and installation ownership are verified
  through server-side database reads before and inside the atomic database
  function.
- Only the existing Contents read/write permission is used. No Administration,
  Actions, Workflows, Secrets, or pull-request endpoint is called.
- GitHub API errors are normalized to internal typed codes before display or
  logging. Raw GitHub responses, API errors, installation tokens, commit SHAs,
  and file content are never logged in their entirety.
- A successful GitHub commit followed by a database failure is recorded as
  `reconciliation_required`; it is never silently discarded and is never retried
  blindly.
- Approved missions that already have a successful commit record cannot produce
  another commit.
- Client Components must not import the admin Supabase client, installation-token
  module, GitHub App config, safe-path validator, or any server secret.
- The commit proposal page renders all AI-generated strings as escaped text.
  None of it is executed or inserted as raw HTML.

---

## 12. Suggested Module Boundaries

Implementation should use the established feature and library boundaries:

```text
src/app/(app)/tasks/[taskId]/commit/page.tsx
src/app/(app)/tasks/[taskId]/commit/loading.tsx
src/features/commits/CommitProposal.tsx
src/features/commits/CommitConfirmForm.tsx
src/features/commits/commit-proposal.service.ts
src/features/commits/commit-proposal.repository.ts
src/features/commits/commit.actions.ts
src/features/commits/commit.types.ts
src/lib/github/commit-file.ts
src/lib/security/safe-path.ts
src/lib/security/branch-name.ts
src/lib/security/commit-content-formatter.ts
```

Or adjust names to match the established conventions in the codebase.

Responsibilities:

- `safe-path.ts` — pure path normalization, blocklist enforcement, and length
  checks; no database or GitHub access;
- `branch-name.ts` — pure branch-name normalization and validation; no I/O;
- `commit-content-formatter.ts` — pure Markdown assembly from a typed mission
  snapshot; no I/O;
- `commit-file.ts` — low-level GitHub API calls: fetch ref SHA, check existing
  file, create branch, write file; accepts a caller-provided installation token
  and never stores it;
- `commit-proposal.repository.ts` — RLS reads for the proposal read model and
  service-role-only RPC calls for the commit record;
- `commit-proposal.service.ts` — orchestration: precondition checks, path/branch
  construction, content formatting, GitHub write flow, and result mapping;
- `commit.actions.ts` — Server Action: authenticate, validate, call service,
  revalidate, return normalized result;
- presentation components — receive typed props, never query the database or
  import server-only modules.

Do not create Unit 13 editor, preview, path-customization, PR, email,
scheduling, or payment modules.

---

## 13. Testing

Use Vitest and Testing Library. GitHub API and database boundaries are mocked in
unit/service tests. No automated test calls the real GitHub API or spends
provider credit.

### Precondition and Ownership

- The owner of an approved mission can load the commit proposal page.
- A missing or foreign task returns the same not-found response.
- A `generated`, `rejected`, `in_progress`, `completed`, or `failed` task cannot
  reach the commit proposal.
- A task that already has a successful commit record shows the already-committed
  state.
- Repository removed, access-status unavailable, installation suspended, and
  installation uninstalled all block the commit.
- Repository or installation belonging to a different user is rejected.

### Safe-Path Validation

- A path beginning with `blumo/` and containing only safe characters succeeds.
- An absolute path is rejected.
- A path containing `..` in any segment is rejected.
- A path containing a null byte is rejected.
- A path containing a backslash is rejected.
- A URL-encoded traversal sequence is rejected after decoding.
- A path not beginning with `blumo/` is rejected.
- A path matching each documented blocked pattern (`.env`, `.github/**`, `.git/**`,
  `node_modules/**`, `credentials/**`, `secrets/**`, etc.) is rejected.
- A path over 240 characters is rejected.
- A path derived from an owned mission title with special characters is
  normalized correctly.

### Branch Name Validation and Behaviour

- A branch name derived from `blumo/<date>-<title>` with safe characters passes.
- A branch name containing unsafe characters is normalized before validation.
- A branch name equal to the repository default branch triggers `invalid_branch`.
- Duplicate branch detection returns `branch_conflict` without force-pushing.
- A branch name over 250 characters is rejected.

### Content Formatter

- The formatter produces a valid Markdown document from mission fields.
- The formatted content contains exactly the title, description, checklist, and
  learning outcome — no extra repository paths, commands, or credentials.
- Content is rendered as escaped text; no raw HTML appears.
- Content over 10 KB triggers `content_too_large`.

### Commit Action and Idempotency

- Valid owner confirmation triggers the GitHub write flow and records the commit.
- Duplicate confirmation (same `operationId`) is idempotent: returns
  `already_committed`, creates no second GitHub call or database row.
- Simultaneous confirmations produce at most one successful commit.
- A successful GitHub commit followed by a database failure records
  `reconciliation_required` without retrying the GitHub write.
- The `commits.task_id` unique constraint blocks a second insert at the database
  level.
- Mission status transitions to `completed` only after the commit record is
  written.

### GitHub API Boundary

- Installation token is generated exactly once per commit attempt and is never
  returned, stored, or logged.
- Branch creation uses the correct base branch SHA from the stored
  `repositories.default_branch`.
- File creation uses the correct Base64-encoded content.
- A 422 branch-already-exists response maps to `branch_conflict`.
- A 403 forbidden response maps to `permission_changed`.
- A 5xx response maps to `github_unavailable` (retryable).
- The GitHub API is never called when any precondition fails.
- No pull-request GitHub API endpoint is called.

### Security

- No GitHub write occurs before the user confirmation action is processed
  server-side.
- The client form accepts only `taskId` and `operationId`; extra fields cause
  `invalid_request`.
- No secret, token, raw GitHub error, installation ID, or file content appears
  in logs, the client bundle, or audit metadata.
- A second user cannot access, load, or submit the commit confirmation for
  another user's task.
- The safe-path validator runs on the server-computed path immediately before the
  GitHub API call, independent of what the proposal page displayed.

---

## 14. Manual Verification

After automated verification passes, perform the following in a
production-like environment:

1. Approve one test mission.
2. Open `/tasks/[taskId]/commit` and verify every proposal field:
   - repository full name matches the selected repository;
   - base branch matches `repositories.default_branch` in Supabase, not assumed
     `main`;
   - proposed branch begins with `blumo/`;
   - proposed path begins with `blumo/` and ends with `.md`;
   - file content contains the mission title, description, checklist, and
     learning outcome as escaped text;
   - commit message matches the approved mission version's `suggested_commit_message`;
   - the AI-generated content notice is visible; and
   - the no-pull-request notice is visible.
3. Click **Cancel** and verify that no GitHub branch or commit was created and
   the task status remains `approved`.
4. Return to the proposal, click **Confirm and commit**, and observe the success
   screen.
5. Verify on GitHub:
   - the mission branch exists and was branched from the correct base branch;
   - the file exists at exactly `blumo/<date>-<title>.md`;
   - the file is inside `blumo/**` and no other application directory was
     modified;
   - the commit message matches the proposal; and
   - no pull request was opened.
6. Verify in Supabase:
   - the `commits` row exists with the correct `task_id`, `user_id`,
     `github_commit_sha`, `branch`, `file_path`, and `status = 'created'`;
   - `daily_tasks.status = 'completed'` and `completed_at` is set; and
   - one `mission_committed` audit event exists with only allowlisted metadata.
7. Repeat **Confirm and commit** on the same proposal page and verify:
   - no second GitHub commit is created;
   - no second `commits` row is inserted; and
   - the response returns `already_committed`.
8. Remove repository access (via webhook or Supabase) and verify the commit
   confirmation is blocked with the `repository_unavailable` message.
9. Suspend the GitHub App installation and verify the commit is blocked with the
   `installation_suspended` message.
10. Verify that the browser source, network responses, logs, database audit
    metadata, and client bundles contain no installation token, private key,
    raw GitHub error, or service-role credential.

---

## 15. Verification Checklist

Before marking Unit 12 complete, all items must pass:

- [ ] `npm run lint` exits with zero errors and zero warnings.
- [ ] `npm run typecheck` exits cleanly.
- [ ] `npm run test` passes with no new ignored failures.
- [ ] `npm run build` produces a clean production build with the
      `/tasks/[taskId]/commit` route present.
- [ ] Safe-path unit tests cover every documented blocked pattern.
- [ ] Branch-name tests cover normalization and the default-branch guard.
- [ ] Idempotency tests verify at most one commit row per task.
- [ ] GitHub API mock tests verify no pull-request endpoint is called.
- [ ] Security tests verify the client form rejects extra fields.
- [ ] Manual verification items 1–10 above have been completed and signed off.
- [ ] `context/database-schema.md` reflects any new columns, constraints, or
      functions added by this unit.
- [ ] `context/security-model.md` reflects the Unit 12 GitHub write controls.
- [ ] `context/progress-tracker.md` is updated with exact automated and manual
      verification results.

Unit 12 is complete only when every item is checked. Specification review or
merge alone is not implementation completion.

---

## 16. Explicit Exclusions

- No Markdown editor, live preview, editable path, or editable commit message.
- No pull-request creation, review, merge, or PR-permission request.
- No direct commit to the default branch.
- No force-push.
- No multi-file commit.
- No repository source-code analysis, tree listing, README read, or branch listing.
- No automatic scheduling, cron trigger, or background queue.
- No Resend, email notification, weekly summary, or streak update.
- No payments, subscriptions, or billing.
- No GitHub branch deletion, branch protection change, or repository setting change.
- No installation token storage, logging, or exposure.
- No client-supplied branch, path, content, or commit message.
- No Unit 13 editor, progress-history, or any later-unit implementation.
