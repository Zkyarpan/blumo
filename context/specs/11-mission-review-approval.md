# Unit 11: Mission Review and Approval

## Status and Scope Authority

This is a planning specification only. It must be reviewed and merged before any
Unit 11 application code or migration is implemented.

This document is the authoritative scope for Unit 11. It defines review,
approval, rejection, immutable mission versions, and bounded regeneration. It
does not authorize the Unit 12 task workspace, generated-artifact editing, or any
GitHub write. Unit 10 remains the authority for initial mission generation.

---

## 1. Goal

Let the authenticated owner review a generated mission and make an explicit
decision before any later repository-writing workflow begins.

At the end of Unit 11, the user can:

- open a dedicated review page for a mission they own;
- see every validated mission field and the verified repository association;
- understand that the content is AI-generated;
- understand that approval does not create a branch, file, commit, or pull
  request;
- approve the current generated version;
- reject the current generated version with an optional plain-text reason; and
- after rejection, request a bounded replacement using required, validated
  feedback.

Every accepted decision is atomic, owner-scoped, idempotent where applicable,
and represented by a sanitized audit event. Rejection and regeneration preserve
all previous mission versions and AI usage history.

### Dependencies

- Unit 10 is complete, manually verified with the real provider, and merged.
- A generated Unit 10 mission is stored in `daily_tasks` with validated content,
  provider/model metadata, prompt version, and a selected repository reference.
- GitHub installation and repository lifecycle state is synchronized by Units
  08 and 09.
- Authenticated app routes, server-side user retrieval, Supabase RLS, the
  provider-neutral `AIProvider`, and mission output validation are available.

### Included Scope

- A dedicated authenticated mission review route and loading/error states.
- A read-only review model containing only owned, validated data.
- Atomic approval and rejection functions and Server Actions.
- Optional rejection reason validation and persistence.
- Required regeneration feedback validation and safe prompt inclusion.
- Immutable mission-version history.
- Bounded, rate-limited, duplicate-safe regeneration through the existing AI
  provider boundary.
- Approval, rejection, and regeneration audit events.
- An approved-state handoff to a Unit 12 placeholder.
- Schema, RLS, service, action, component, concurrency, and security tests.

---

## 2. Product Decisions

### Review Before Workspace

Unit 11 reviews the mission itself: the learning task, scope, checklist, outcome,
branch suggestion, and commit-message suggestion. It does not yet create or edit
the repository artifact described by later units.

The review page is not the final commit-approval screen described in the project
overview. The final commit approval still occurs after the Unit 12 workspace and
later commit-validation specification, when the exact repository, branch, path,
full file content, and commit message can be shown together.

### No Generated-Content Editing in Unit 11

Users cannot edit generated mission content in the Unit 11 MVP.

This is an explicit boundary:

- the title, description, difficulty, estimate, checklist, suggested branch,
  suggested commit message, and learning outcome are read-only;
- a user who does not accept the mission rejects it and may request a replacement;
- editable Markdown, file path, artifact content, and final commit message remain
  Unit 12 or later work; and
- Unit 11 accepts only an optional rejection reason and required regeneration
  feedback as user-authored fields.

This avoids silently changing validated AI output and keeps the approval record
attached to an exact immutable mission version.

### Logical Mission and Immutable Versions

`daily_tasks` remains the logical daily mission and workflow record. A new
`mission_versions` table stores immutable snapshots of each valid AI mission
version.

The task points to exactly one current version when it is in a reviewable or
post-review state. Regeneration never overwrites an existing version. It creates
the next sequential version and changes the task's current-version pointer only
after the new output has passed the complete Unit 10 provider-envelope, Zod,
domain, and safety validation.

---

## 3. Mission State Model

### Stable Mission States

The stable mission workflow states are:

| State | Meaning |
| --- | --- |
| `generated` | A valid current mission version exists and awaits the user's decision. |
| `approved` | The owner approved the exact current version; no GitHub write has occurred. |
| `rejected` | The owner rejected the current version; it remains history and cannot become active directly. |
| `in_progress` | The approved mission has entered the later task workspace. Unit 11 does not enter this state. |
| `completed` | The later contribution workflow completed successfully. Unit 11 does not enter this state. |
| `failed` | Initial mission generation has no valid current version and is recoverable only through the Unit 10 generation rules. |

The inherited Unit 10 `generating` value is an internal transient generation
state, not a user review decision. `archived` is a retention marker outside the
active workflow. Neither is presented as one of the six stable mission states.

Unit 11 regeneration does not change the task to `generating`. The task remains
`rejected` while a separate regeneration request is processing. This preserves
the user's decision and avoids presenting a rejected version as active.

### Valid Stable-State Transitions

| From | To | Trigger | Authorized unit |
| --- | --- | --- | --- |
| `failed` | `generated` | Successful permitted recovery creates the first valid version. | Existing Unit 10 generation service |
| `generated` | `approved` | Owner approves the exact current version. | Unit 11 |
| `generated` | `rejected` | Owner rejects the exact current version. | Unit 11 |
| `rejected` | `generated` | Bounded regeneration succeeds and atomically creates a new current version. | Unit 11 |
| `approved` | `in_progress` | The approved version enters the task workspace. | Reserved for Unit 12 |
| `in_progress` | `completed` | The later contribution workflow completes successfully. | Reserved for a later reviewed unit |

No other stable-state transition is valid.

In particular:

- `generated -> generated` is invalid; the user must reject before regeneration;
- `rejected -> approved` is invalid; rejection cannot be undone in place;
- `approved -> rejected`, `approved -> generated`, and approval-time regeneration
  are invalid;
- `in_progress` cannot be approved, rejected, or regenerated;
- `completed` is terminal;
- `failed` cannot be approved or rejected because it has no valid current
  version; and
- changing a row directly to bypass the transition service is forbidden.

### Idempotent Repeats Are Not New Transitions

- Repeating approval for the same already-approved current version returns
  `already_approved`, does not change timestamps, and writes no duplicate audit
  event.
- Repeating rejection for the same already-rejected current version returns
  `already_rejected`, does not replace the stored reason, and writes no duplicate
  audit event.
- Replaying regeneration for a source version that already produced a successor
  returns the existing successor and never calls the provider again.
- A stale expected version returns `stale_version` or `invalid_transition`; it
  never applies the decision to a newer version.

### Version Decision States

An immutable `mission_versions` row has one of:

- `generated`: current and awaiting a decision;
- `approved`: approved exact snapshot; immutable; or
- `rejected`: rejected exact snapshot; immutable.

The task may later be `in_progress` or `completed` while its approved version
remains `approved`. A regeneration provider failure creates no mission version;
the failure belongs to `mission_regeneration_requests` and the task remains
`rejected`.

---

## 4. Review Route and Read Model

### Route

Use an authenticated route equivalent to:

```text
/tasks/[taskId]/review
```

The route parameter is an untrusted identifier, not authorization. The Server
Component must:

1. retrieve the authenticated Supabase user;
2. validate `taskId` as a UUID;
3. load the task through the owner-scoped RLS client;
4. load only the task's current mission version and repository presentation
   fields;
5. return the same not-found experience for a missing and foreign task; and
6. never reveal whether another user's task exists.

The read model selects only required columns. It must not include internal AI
usage, provider request IDs, prompts, raw responses, installation IDs, GitHub
numeric IDs, service-role data, audit metadata, secrets, or another version's
private rejection feedback.

### Review Page Content

Show:

- mission title;
- description;
- difficulty;
- estimated time;
- every acceptance-checklist item;
- suggested branch;
- suggested commit message;
- learning outcome;
- verified repository display name from owned database data, never AI text;
- the task's user-local `scheduled_date` as the mission date;
- the current version number and generation timestamp; and
- current review status.

Display a visible **AI-generated mission** label and explanatory text stating:

- the mission was generated from saved preferences and repository metadata;
- repository contents were not inspected; and
- approval records the user's decision but does not create a branch, file,
  commit, or pull request.

Render every mission string as escaped React text. Do not use raw HTML or treat
mission text as a path, URL, command, or authorization decision.

### Repository Presentation and Availability

Use the stored owned repository relationship for presentation. Show its current
`full_name` when available; use a neutral historical-repository label if the
relationship was removed while preserving task history.

The page remains readable after repository removal, installation suspension, or
uninstallation. Those conditions block approval and regeneration and show a
clear repository-unavailable state with a link to repository management.

Repository availability for a Unit 11 mutation requires all of:

```text
daily_tasks.user_id = authenticated user
repositories.id = daily_tasks.repository_id
repositories.user_id = authenticated user
repositories.is_selected = true
repositories.access_status = active
github_installations.id = repositories.installation_id
github_installations.user_id = authenticated user
github_installations.status = active
```

This check uses synchronized database state. Unit 11 does not request a GitHub
installation token and does not call a GitHub read or write API.

---

## 5. Authenticated Mutation Boundary

Use Server Actions for approval, rejection, and regeneration. They are
authenticated application mutations and require no public HTTP endpoint.

Every action must:

1. retrieve the authenticated Supabase user server-side;
2. parse a strict Zod input schema;
3. ignore only documented Next.js `$ACTION_*` transport metadata;
4. reject unexpected fields;
5. derive `user_id` from the session, never form data;
6. treat task/version identifiers as untrusted lookup keys;
7. call one domain service;
8. use an atomic database function for the state mutation;
9. return a fixed discriminated result without raw database/provider errors; and
10. revalidate affected routes only after a committed mutation.

The browser may submit only:

- the target task ID;
- the expected current version number or version ID for stale-form protection;
- optional rejection reason for rejection; or
- required feedback for regeneration.

The browser never submits or controls:

- `user_id`, goal ID, repository ID, installation ID, owner, scheduled date;
- mission ownership or current-version pointer;
- AI provider/model/prompt metadata;
- approval/rejection timestamps;
- internal status, retry counters, operation IDs, or audit values; or
- any GitHub token, endpoint, path, content, branch operation, or permission.

Next.js Server Action origin protections and the authenticated session are the
CSRF boundary. Database row locks, expected-version comparison, current-state
checks, partial unique indexes, and idempotent result handling are the replay and
concurrency boundary. A hidden client flag is never trusted as approval.

---

## 6. Approval

### Eligibility

Approval is permitted only when:

- the user is authenticated;
- the task and current version belong to the user;
- task status is `generated`;
- the current version status is `generated`;
- the submitted expected version is still current;
- no regeneration request is processing;
- the task has no successful commit record; and
- the task's selected repository and installation still satisfy the active,
  accessible ownership checks above.

### Atomic Approval

Add a narrowly scoped service-role-only database function equivalent to
`approve_mission_version`. In one transaction it must:

1. lock the owned task and current version;
2. validate the expected version and transition;
3. recheck repository and installation ownership/availability;
4. set the current version status to `approved`;
5. set `mission_versions.approved_at = transaction_timestamp()`;
6. set `daily_tasks.status = 'approved'`;
7. set the existing `daily_tasks.approved_at` to the same timestamp;
8. leave every generated mission field and AI metadata unchanged; and
9. insert one sanitized `mission_approved` audit event.

The function returns a fixed result such as:

```text
approved
already_approved
not_found
repository_unavailable
stale_version
invalid_transition
```

It must be `security definer`, use a fixed `search_path`, revoke execution from
`public`, `anon`, and `authenticated`, and be callable only from the trusted
server boundary after independent authentication.

### Idempotency

If the same owned task and exact version are already approved, return
`already_approved`. Do not change `approved_at`, duplicate the audit event, or
perform any later-unit operation.

Simultaneous approval requests serialize on the task row. Simultaneous approval
and rejection requests cannot both succeed; the first committed transition wins
and the other receives `invalid_transition` or `stale_version`.

### Post-Approval Handoff

After approval:

- revalidate the dashboard and review route;
- redirect to a scoped `/tasks/[taskId]` approved placeholder; and
- show that the mission is approved and that the editable workspace is the next
  implementation step.

The placeholder contains no Markdown editor, path field, artifact generator,
commit control, GitHub API call, or Unit 12 behavior.

---

## 7. Rejection

### Rejection Input

The user may provide an optional rejection reason.

Normalize an empty or whitespace-only value to `null`. A non-empty reason must:

- be plain text between 3 and 500 characters after trimming;
- be Unicode-normalized;
- contain no control characters or HTML tags;
- contain no detected secret/token/private-key pattern;
- contain no prompt-injection or approval-bypass instruction; and
- be stored only after server-side validation.

Do not silently truncate, HTML-sanitize, or rewrite an invalid reason into
validity. Return a field-specific validation error and preserve the user's input.

### Atomic Rejection

Add a service-role-only function equivalent to `reject_mission_version`. In one
transaction it must:

1. lock the owned task and current version;
2. require task and version state `generated` and the expected current version;
3. set the version status to `rejected`;
4. set `mission_versions.rejected_at = transaction_timestamp()`;
5. save the validated nullable rejection reason on that version;
6. set `daily_tasks.status = 'rejected'`;
7. set `daily_tasks.rejected_at` to the same timestamp; and
8. write one sanitized `mission_rejected` audit event.

The original mission content, provider/model/prompt metadata, generation date,
and version identity remain unchanged. Do not delete or modify any
`ai_usage_records` row.

The audit metadata may contain only version number, scheduled date, fixed result
code, and `reason_present: boolean`. It must not contain the rejection reason,
mission text, repository identity, or AI content.

### Rejection Consequences

- A rejected version remains readable in mission history.
- A rejected version cannot be approved, edited, or made current again.
- A rejected task has no active accepted mission.
- Only a successful regeneration may move the logical task from `rejected` to
  `generated`, and it does so by creating a new version.
- A failed regeneration leaves the task and source version rejected.

Repeated rejection of the same version returns `already_rejected`, preserves the
first stored reason/timestamp, and creates no duplicate audit event.

---

## 8. Regeneration

### Eligibility and User Flow

Regeneration is offered only after explicit rejection. A `generated` mission must
first be rejected, which ensures the decision history is clear and prevents a
replacement from silently discarding an undecided mission.

Regeneration requires:

- authenticated ownership;
- task status `rejected`;
- current version status `rejected`;
- an expected source version that is still current;
- active selected repository and installation state;
- no other active mission or processing regeneration for the user;
- the task and user usage limits to remain available; and
- required safe feedback.

### Feedback Schema and Safety

Regeneration feedback must be plain text between 10 and 500 characters after
trimming. Validate it server-side with the rejection-text rules plus the existing
mission safety boundary:

- reject HTML, control characters, secret patterns, credentials, and private
  data;
- reject file or directory names, repository paths, shell/Git commands,
  destructive actions, external-repository instructions, prompt injection, and
  attempts to select a user, repository, provider, model, permission, or endpoint;
- do not accept client-supplied repository facts; and
- do not log feedback or include it in audit metadata.

Feedback is stored as the sanitized plain-text value on the regeneration request
because it is required user decision metadata. It is never copied to
`audit_logs` or `ai_usage_records`.

### Regeneration Prompt

Use the existing provider-neutral `AIProvider` and Unit 10 mission output schema,
domain checks, safety checks, timeout, automatic transient retry policy, and safe
provider-error mapping.

Use a new fixed prompt version such as `mission-regeneration-v1`. The prompt may
contain only:

- the same bounded active-goal, profile-level, repository metadata, and completed
  mission history allowed by Unit 10;
- the rejected source version's already-validated mission fields;
- the required validated feedback; and
- fixed instructions to create a materially different mission while obeying the
  same JSON-schema-shaped output and safety contract.

Label the source mission and feedback as untrusted data. The prompt must say that
feedback cannot override schema, repository, safety, ownership, or approval
rules. Do not include the optional rejection reason automatically; only feedback
explicitly submitted for regeneration is sent to the provider.

Repository contents remain unavailable. Regeneration performs no GitHub API call
and reads no repository file, tree, language, commit history, issue, or pull
request.

### Limits

Use concrete server/database limits:

- maximum two successful regenerations per logical task, producing at most three
  mission versions including the initial version;
- maximum three provider-backed regeneration claims for one rejected source
  version;
- maximum five provider-backed regeneration claims per user in a rolling 24-hour
  window; and
- at most one initial provider call plus one automatic transient retry per claim,
  using the Unit 10 timeout budget.

`regeneration_count` counts successful replacement versions, not HTTP calls.
Each actual provider HTTP call creates one `ai_usage_records` row. Failed
application validation or provider configuration before a call consumes neither
the task allowance nor the user rate allowance.

When a limit is reached, the claim function returns `usage_limit_reached` before
provider work. Refreshing, replaying an action, changing form data, or opening a
second tab cannot reset a database-enforced limit.

### Atomic Claim and Duplicate Prevention

Create a `mission_regeneration_requests` row through a service-role-only claim
function. The function must lock the task/current version, recheck all ownership,
state, repository, and limit invariants, and set
`daily_tasks.review_operation_status = 'regenerating'` atomically.

Enforce:

- one processing regeneration request per task with a partial unique index;
- one successor-producing request per rejected source version;
- a monotonic request claim version for stale-response protection;
- a unique server-generated provider-call ID for every actual HTTP call; and
- the one-active-mission invariant while regeneration is processing.

The Unit 10 daily-generation claim must be replaced in the new migration so it
also treats `review_operation_status = 'regenerating'` as an active mission. Both
claim paths must use a common per-user transactional lock, such as locking the
owned profile row, before evaluating the one-active-mission invariant. This
prevents a new daily task and a regeneration from being claimed concurrently.

Duplicate submissions return the existing processing request or successor. They
do not create a second provider call.

### Finalize Regeneration

After the provider returns, validate the output exactly as Unit 10 validates an
initial mission. In one transaction, finalization must:

1. lock the task, source version, and regeneration request;
2. require the current request claim version and `processing` status;
3. require the task/current source version still be rejected and owned;
4. recheck active goal, selected repository, and installation state;
5. insert the next immutable `mission_versions` row with sequential version
   number and status `generated`;
6. copy the exact validated mission and safe AI provider/model/prompt metadata;
7. point `daily_tasks.current_mission_version_id` to the new version;
8. update the current mission snapshot fields on `daily_tasks` atomically;
9. set task status to `generated`, clear current rejection/error fields, and set
   `review_operation_status = 'idle'`;
10. increment `daily_tasks.regeneration_count`;
11. mark the request `succeeded` and link its result version;
12. insert all idempotent AI usage rows, marking only the accepted final provider
    call successful; and
13. insert one sanitized `mission_regeneration_succeeded` audit event.

The source rejected version remains unchanged.

### Failed Regeneration

Provider, schema, safety, repository-change, or persistence failure must:

- create no mission version;
- leave the task and source version rejected;
- clear `review_operation_status` back to `idle` when the current claim owns it;
- mark only the current request failed with an allowlisted error code;
- insert one usage row per actual provider call;
- increment provider-backed allowance only when a provider call occurred; and
- write a sanitized `mission_regeneration_failed` audit event atomically with the
  failure state.

Raw provider output, provider messages, prompt text, user feedback, and stack
traces are never persisted as failure details.

---

## 9. Data Behaviour and Migration

Create the next unused ordered migration. Never edit an applied Unit 10 migration.
Update `context/database-schema.md` and `context/security-model.md` before Unit 11
implementation applies the migration.

### `daily_tasks` Additions

Add:

| Column | Type | Rules |
| --- | --- | --- |
| `current_mission_version_id` | uuid | Nullable during backfill/failed generation; FK to `mission_versions.id` added after version table creation |
| `rejected_at` | timestamptz | Nullable; timestamp for the current rejected state |
| `review_operation_status` | text | `idle` or `regenerating`; default `idle` |
| `regeneration_count` | smallint | Default `0`; between `0` and `2` |

Keep the existing `approved_at`. `user_id`, goal, repository, scheduled date, AI
metadata, generation claim version, and provider-generation allowance remain
server-owned.

The current mission fields in `daily_tasks` remain an atomic current-version
snapshot for dashboard compatibility. `mission_versions` is the immutable source
for review history. Finalization functions must update the current pointer and
snapshot together; partial updates are forbidden.

### `mission_versions`

Create:

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | Primary key, database generated |
| `task_id` | uuid | References `daily_tasks.id`; cascade only with controlled task/account deletion |
| `user_id` | uuid | References `profiles.id`; must equal task owner |
| `version_number` | integer | Positive, sequential per task |
| `status` | text | `generated`, `approved`, or `rejected` |
| `title` | text | Exact validated snapshot |
| `description` | text | Exact validated snapshot |
| `estimated_minutes` | integer | Unit 10 allowed values |
| `difficulty` | text | Unit 10 allowed values |
| `acceptance_checklist` | jsonb | Validated 2–6 string array |
| `suggested_commit_message` | text | Exact validated snapshot |
| `suggested_branch` | text | Exact verified default-branch suggestion |
| `learning_outcome` | text | Exact validated snapshot |
| `ai_provider` | text | Server-owned safe identifier |
| `ai_model` | text | Nullable server-owned safe identifier |
| `prompt_version` | text | Fixed prompt version used for this snapshot |
| `generation_claim_version` | integer | Monotonic source claim/reference |
| `approved_at` | timestamptz | Nullable |
| `rejected_at` | timestamptz | Nullable |
| `rejection_reason` | text | Nullable validated user text, maximum 500 characters |
| `created_at` | timestamptz | Default now; generation timestamp |

Constraints:

- unique `(task_id, version_number)`;
- version number starts at one and never changes;
- owner consistency is enforced by composite foreign key or transactional
  function checks, not application convention alone;
- status/timestamp consistency: approved requires `approved_at`, rejected
  requires `rejected_at`, generated has neither;
- mission shape and size constraints mirror successful Unit 10 output where
  practical; and
- no update policy permits browser mutation of immutable mission fields.

### `mission_regeneration_requests`

Create:

| Column | Type | Rules |
| --- | --- | --- |
| `id` | uuid | Primary key, database generated |
| `task_id` | uuid | Owned logical mission |
| `user_id` | uuid | Authenticated owner |
| `source_version_id` | uuid | Rejected current source version |
| `result_version_id` | uuid | Nullable successor version |
| `status` | text | `processing`, `succeeded`, or `failed` |
| `feedback` | text | Required validated text, 10–500 characters |
| `claim_version` | integer | Positive monotonic stale-response guard |
| `provider_attempts` | smallint | Provider-backed failed claims for this source; `0`–`3` |
| `error_code` | text | Nullable allowlisted fixed code only |
| `claimed_at` | timestamptz | Current claim time |
| `completed_at` | timestamptz | Nullable |
| `created_at` | timestamptz | Default now |
| `updated_at` | timestamptz | Default now |

Add a partial unique index for one `processing` request per task and a uniqueness
constraint preventing more than one successful successor for a source version.
Failed retries reuse the same request row and increment its monotonic claim
version; they do not overwrite feedback.

### `ai_usage_records`

Extend the operation constraint with `mission_regeneration`. Add nullable
`mission_version_id` and `regeneration_request_id` foreign keys if needed for
unambiguous usage ownership and inspection. Existing Unit 10 rows remain valid.

Every actual regeneration provider call remains append-only and idempotent by
`provider_call_id`. Rejection and approval create no AI usage row. Rejected
mission usage is never deleted by product behavior.

### Status Constraint and Legacy Values

Replace the named `daily_tasks.status` constraint in the new migration. Permit:

```text
generating
generated
approved
rejected
in_progress
completed
failed
archived
```

Before replacing it:

- preflight for unexpected `ready` or `committing` rows and abort for explicit
  resolution rather than guessing;
- normalize a valid legacy `committed` row to `completed` only when its existing
  completion/commit invariants prove equivalence; otherwise abort; and
- update Unit 10 completed-mission history queries and dashboard counts to use
  `completed`.

Do not silently delete or merge any task.

### Active Mission Constraint

Replace the one-active-mission index so a user may have at most one row where:

```text
status in (generating, generated, approved, in_progress)
or review_operation_status = regenerating
```

`rejected`, `completed`, `failed`, and `archived` history does not block a later
mission unless a rejected task currently has an active regeneration claim.

### Backfill

For each existing task with valid Unit 10 mission fields:

1. create version `1` from the exact stored snapshot and AI metadata;
2. map task state `generated` to version state `generated`;
3. map a provably approved/post-approval historical task to version state
   `approved` with its existing timestamp;
4. set `current_mission_version_id`; and
5. leave failed/generating placeholders without a version.

The migration must be deterministic and idempotent within one application. It
must stop if current mission data cannot satisfy the version schema; it may not
coerce, truncate, or fabricate missing content.

### RLS and Function Privileges

- Enable RLS on both new tables in their creation migration.
- Authenticated users may select only rows where `user_id = auth.uid()`.
- Grant no browser insert, update, or delete policy on mission versions or
  regeneration requests.
- All lifecycle writes use narrowly scoped service-role-only functions after
  independent server authentication.
- Every function uses `security definer`, a fixed `search_path`, explicit input
  validation, row locks, owner checks, and revoked execution for `public`, `anon`,
  and `authenticated`.
- Test RLS with two distinct users.

---

## 10. Audit Trail

Use fixed actions:

```text
mission_approved
mission_rejected
mission_regeneration_started
mission_regeneration_succeeded
mission_regeneration_failed
```

Set audit `user_id` from the independently authenticated owner,
`resource_type = 'task'`, and `resource_id = task_id`.

Allowlisted metadata may contain only:

- mission version number;
- source/result version number for regeneration;
- scheduled date;
- fixed result/error code;
- regeneration claim number;
- prompt/provider identifier when a provider call occurred; and
- booleans such as `reason_present` or `feedback_present`.

Never include:

- mission content or checklist values;
- rejection reason or regeneration feedback;
- repository name/full name/ID;
- prompt content or raw AI response;
- AI usage counts;
- provider error messages;
- user email/profile text;
- tokens, keys, private identifiers, or stack traces.

Audit insertion is in the same transaction as the decision/request lifecycle
mutation. Idempotent no-op repeats do not create another audit row.

---

## 11. UI States and Interaction

Follow the existing light-first tokens, responsive app shell, card radius, focus
ring, and accessible form conventions.

### Review

- Show all required mission/repository/date fields.
- Show an AI-generated badge and no-GitHub-write explanation.
- Show **Approve mission** as the primary action.
- Show **Reject mission** as a visually separate destructive/secondary decision.
- Do not mix approval with later commit language.
- Do not show regeneration until rejection succeeds.

### Approving

- Disable approval and rejection controls.
- Set the review region `aria-busy=true`.
- Show **Approving mission…** and a stable loading indicator.
- Prevent client double submission while relying on row locking for correctness.

### Approved

- Announce **Mission approved. No GitHub changes have been made.**
- Show approval timestamp and exact approved version.
- Hide rejection and regeneration controls.
- Redirect or link to the scoped Unit 12 placeholder.

### Rejecting

- Open an accessible form/dialog with optional reason textarea.
- Preserve the entered reason after recoverable validation/database errors.
- Disable duplicate submission and show **Rejecting mission…**.
- Keep approval unavailable while rejection is pending.

### Rejected

- Show the rejected version read-only with its rejection timestamp.
- Show the stored reason to the owner when present.
- Explain that this exact version cannot be approved.
- Offer **Request a new mission** only when repository and limits allow it.

### Regenerating

- Require feedback before submission.
- Disable all review mutations.
- Show **Creating a replacement mission…** with accessible live status.
- Preserve the rejected source version visibly or link to its history.
- A reload reads the processing request and shows the same state; it does not
  submit another request.

### Provider Unavailable

- Keep the source version rejected and readable.
- Show a fixed safe message based on normalized provider category.
- Offer retry only when the same request, repository, and limits permit it.
- Never show provider body, prompt, feedback echo from the provider, or secrets.

### Repository Unavailable

- Keep review/history readable.
- Disable approval and regeneration.
- Explain that repository access must be restored or another future mission
  selected; do not imply the historical mission was deleted.
- Link to repository management.

### Invalid Transition

- Show that the mission changed in another tab or is no longer eligible.
- Refresh the server-rendered state.
- Do not expose internal status details or another user's resource existence.

### Usage Limit Reached

- Explain that no more replacements are available for this mission/time window.
- Keep all versions and feedback history readable.
- Show no enabled regeneration button.
- Refreshing or changing form input does not change the server result.

### Loading, Error, and Accessibility

- Add route loading skeleton matching the review layout.
- Use semantic headings, lists for checklist items, labels/descriptions for
  textareas, keyboard-accessible controls, visible focus, and non-colour-only
  status communication.
- Use `role=status`/`aria-live` for successful asynchronous state changes and
  `role=alert` for actionable failures.
- Preserve layout dimensions during pending actions.
- Verify mobile single-column order and comfortable touch targets.

---

## 12. Security Requirements

- Unit 11 performs no GitHub write and no GitHub API call.
- Unit 11 generates no installation token and exposes or persists none.
- Approval is a fresh server-validated mutation, never a client boolean.
- The authenticated user ID is always derived server-side.
- Task/version IDs are checked against ownership and do not grant access.
- Repository and installation state is rechecked inside every approval and
  regeneration transaction.
- Mission content, user feedback, and AI output are untrusted.
- User feedback is bounded and validated before storage or prompt inclusion.
- Hidden prompts, system instructions, raw responses, usage internals, service
  keys, and provider credentials are never rendered.
- No generated or user-authored text controls status, repository identity,
  permissions, model, endpoint, or database function selection.
- Row locks, expected-version guards, partial unique indexes, provider-call IDs,
  and current-request claim versions prevent replay and duplicate mutations.
- Approved, in-progress, and completed missions can never be overwritten or
  regenerated.
- Rejected versions and AI usage are append-only product history.
- Audit metadata is allowlisted and contains no secrets, reason/feedback text,
  prompts, responses, repository identity, or stack traces.
- Client Components import no admin client, AI provider, provider config, prompt,
  secret, or installation-token module.

---

## 13. Suggested Module Boundaries

Implementation should use the established `src/features/missions/` boundary and
create only modules required by this unit, equivalent to:

```text
src/app/(app)/tasks/[taskId]/review/page.tsx
src/app/(app)/tasks/[taskId]/review/loading.tsx
src/app/(app)/tasks/[taskId]/page.tsx
src/features/missions/mission-review.schema.ts
src/features/missions/mission-review.types.ts
src/features/missions/mission-review.repository.ts
src/features/missions/mission-review.service.ts
src/features/missions/mission-review.actions.ts
src/features/missions/mission-regeneration-prompt.ts
src/features/missions/MissionReview.tsx
src/features/missions/MissionDecisionControls.tsx
```

Responsibilities:

- schemas validate action input, reason, feedback, and read models;
- the repository owns RLS reads and atomic RPC calls;
- the service owns transition orchestration and injected provider/repository
  dependencies;
- actions authenticate, validate, map fixed results, revalidate, and redirect;
- the regeneration prompt is pure, versioned, bounded, and provider-neutral;
- Client Components own pending form interaction only; and
- presentation components never query the database or import secrets.

Do not create Unit 12 editor, preview, path, artifact, commit, PR, email,
scheduling, or payment modules.

---

## 14. Testing

Use Vitest and Testing Library. Provider and database boundaries are mocked in
unit/service tests. No automated test spends provider credit or requires GitHub.

### Review and Ownership

- The owner can load and review every required mission field.
- A missing task and another user's task produce the same not-found result.
- The review query uses the RLS client and selects no secret/internal fields.
- AI-generated and no-GitHub-write notices are visible.
- Repository-unavailable history remains readable but mutations are blocked.

### Approval

- Valid owner approval succeeds and saves the same `approved_at` on task/version.
- Duplicate approval is idempotent: same timestamp, one audit row, no downstream
  side effect.
- Simultaneous approvals produce one mutation.
- Approval and rejection racing produce exactly one valid decision.
- Stale version, foreign task, failed/generated mismatch, rejected, in-progress,
  completed, and processing-regeneration approval are rejected.
- Repository removed/unavailable, installation suspended/uninstalled, unselected
  repository, and ownership mismatch block approval.
- Approval redirects only to the scoped placeholder.

### Rejection

- Rejection without a reason succeeds.
- A valid reason is normalized and saved only on the rejected version.
- Invalid/oversized/HTML/control/secret/injection reasons fail with field errors.
- Rejection preserves the mission snapshot, AI usage, provider metadata, and all
  history.
- Duplicate rejection is idempotent and cannot replace the original reason.
- A rejected version cannot be approved or made active directly.

### Regeneration

- Regeneration requires a rejected current version and valid feedback.
- Generated, approved, in-progress, completed, failed-without-version, foreign,
  and stale versions cannot regenerate.
- Feedback safety rejects files/paths, commands, secrets, injection, and client
  attempts to select protected context.
- The prompt contains bounded safe feedback and rejected-version context as
  untrusted data, with no repository contents or identifiers.
- Successful regeneration creates the next version and preserves the source.
- Current pointer and task snapshot update atomically.
- Approved and completed missions are never overwritten.
- A failed provider/schema/safety response creates no version and leaves the
  source rejected.
- One processing request prevents simultaneous duplicate provider calls.
- Replaying a successful source request returns the existing successor.
- Per-source provider claim limit, maximum two successful regenerations, and
  user rolling-24-hour limit are enforced before provider work.
- Every actual provider call creates one idempotent usage row; validation/config
  failure before a call creates none.
- Repository/access change during the call blocks finalization.

### State, Database, and RLS

- Every valid transition in the table succeeds only through its authorized
  boundary.
- Every unspecified transition is rejected server-side.
- Migration backfills one exact version for each valid existing mission.
- Invalid legacy data causes migration preflight failure rather than coercion.
- Unique version numbers and one-processing-request indexes reject duplicates.
- Two users cannot read each other's version, request, reason, or feedback rows.
- Browser roles cannot execute lifecycle functions or insert/update/delete the
  new tables.
- Functions set fixed search paths and service-role-only execution.
- Audit actions are atomic, idempotent, fixed, and sanitized.

### UI and Security

- Review, approving, approved, rejecting, rejected, regenerating, provider
  unavailable, repository unavailable, invalid transition, and usage-limit states
  render correctly.
- Pending controls are disabled and accessible announcements are present.
- User input survives recoverable validation errors.
- No mission content uses raw HTML.
- No secret, prompt, provider body, usage detail, internal ID, rejection reason,
  or regeneration feedback appears in logs/audit/client output outside its
  explicitly owned review field.
- Spies prove no GitHub API, installation-token generator, branch, content,
  commit, or pull-request function is called.

Required acceptance cases include:

- owner can review mission;
- another user cannot access it;
- valid approval succeeds;
- duplicate approval is idempotent;
- invalid state transition is rejected;
- rejection preserves history;
- regeneration creates a new version;
- approved mission is not overwritten;
- retry limit is enforced;
- repository-unavailable state blocks approval;
- no GitHub write API is called; and
- no secret appears in client output.

---

## 15. Verification

After implementation, run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

All commands must exit successfully with no ignored Unit 11 failure.

Manual verification in a production-like environment must confirm:

1. The owner opens the review page and sees every required field, repository,
   generation date, AI label, and no-GitHub-write explanation.
2. A second user cannot load or mutate the task, version, reason, or feedback.
3. Approval saves one timestamp and audit event, is idempotent on repeat, and
   reaches only the scoped placeholder.
4. Repository removal, unselection, suspension, and uninstall states block
   approval and regeneration while history remains readable.
5. Rejection with and without a reason preserves the exact mission and all Unit
   10 usage rows.
6. Invalid reason and feedback values show field errors without losing safe user
   input.
7. Regeneration shows loading, creates one new version, preserves the rejected
   version, updates the current pointer, and displays the replacement.
8. Duplicate-tab regeneration creates one provider operation and one successor.
9. Provider outage/invalid output leaves the source rejected, records sanitized
   usage/failure, and offers retry only within limits.
10. Approved, in-progress, and completed tasks reject regeneration and remain
    unchanged.
11. Task, source version, result version, request, AI usage, and audit rows contain
    only the documented fields and relationships.
12. RLS is verified with two users and browser roles cannot call lifecycle RPCs.
13. Review states work on mobile and desktop with keyboard navigation, visible
    focus, labels, alerts, and status announcements.
14. Browser source, network responses, logs, database audit metadata, and client
    bundles contain no secret, hidden prompt, raw response, installation token,
    or service-role data.
15. No GitHub installation token is generated and no GitHub read/write API,
    branch, file, commit, or pull-request operation occurs.

Before marking Unit 11 complete:

- update `context/database-schema.md`, `context/security-model.md`, and any other
  changed context to the implemented contract;
- update `context/progress-tracker.md` with exact automated and manual results;
- record unresolved failures instead of weakening ownership, state, safety,
  idempotency, or history guarantees; and
- do not begin Unit 12.

Unit 11 is complete only when every applicable automated and manual verification
item passes. Specification review or merge alone is not implementation
completion.

---

## 16. Explicit Exclusions

- No GitHub branch creation, switching, deletion, or protection change.
- No repository file creation, read, update, deletion, upload, or tree access.
- No GitHub commit, force push, reconciliation, pull request, review, merge, or
  release.
- No installation-token generation, exposure, or persistence.
- No editable Markdown, artifact content, file path, final commit message,
  preview, save-draft, ready-for-review, or Unit 12 task workspace.
- No direct editing of generated mission fields in Unit 11.
- No automatic approval, automatic commit, or approval inferred from client
  state.
- No repository-aware AI retrieval, source-code ingestion, README/tree/language
  lookup, embedding, or code execution.
- No background queue, automated scheduling, cron, reminder, or notification.
- No Resend, email, weekly summary, streak, analytics, monitoring, referral,
  payment, subscription, or billing work.
- No new AI provider, provider-selection UI, or cross-provider fallback.
- No GitHub webhook feature or permission change.
- No pull-request permission.
- No Unit 12 functionality or any later-unit implementation.
