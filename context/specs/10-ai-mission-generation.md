# Unit 10: AI Mission Generation

## Status and Scope Authority

This is a planning specification only. Its review and merge are prerequisites for
Unit 10 implementation.

This specification is the authoritative Unit 10 scope. It combines the AI
provider boundary and the authenticated, persisted daily-mission flow required by
the current product sequence. The older provider-only summary for Unit 10 and
separate manual-generation summary in `context/specs/00-build-plan.md` must be
reconciled when this specification is reviewed and merged. This document does not
authorize implementation of Unit 11 or any other later unit.

---

## 1. Goal

Generate and save one personalized coding mission for the authenticated user's
local day. The mission must be practical for the user's available time and must
be based only on verified Blumo data:

- the user's active learning goal, including technology, task type, and available
  daily minutes;
- the user's one active selected GitHub repository;
- stored metadata for that repository;
- a bounded summary of the user's previous completed missions for the active
  goal; and
- the user's stored experience level.

At the end of Unit 10, an authenticated and onboarded user with an active verified
GitHub installation and selected active repository can select **Generate today's
mission**, wait through a clear loading state, and receive one saved, validated
mission. Returning to the dashboard on the same local day shows that mission and
does not call the AI provider again.

Unit 10 does not read repository contents. Repository metadata can personalize
the mission at a broad level, but it cannot prove that a file, directory,
framework, command, or project convention exists. The mission therefore must not
name a repository file or path.

---

## Dependencies

- Unit 09 is complete and verified.
- Authentication, onboarding, the active-goal invariant, and protected routes are
  complete.
- The authenticated user has at most one active verified GitHub App installation
  and at most one selected active repository.
- `daily_tasks` and `ai_usage_records` exist with RLS enabled.
- The dashboard shell and mission card exist.
- Pollinations credentials can be supplied through protected server environment
  variables.

---

## Included Scope

- A provider-neutral server-only `AIProvider` contract.
- A Pollinations text provider adapter using its OpenAI-compatible API.
- Versioned mission prompt construction.
- Strict Zod validation and deterministic safety validation of provider output.
- Authenticated mission generation through a Server Action.
- User, goal, repository, and installation ownership/access checks.
- One mission row per authenticated user and user-local date.
- Atomic generation claiming, finalization, failure, and bounded retry behavior.
- Saving validated missions and provider usage records.
- Dashboard mission loading, empty, success, error, and retry states.
- Unit, service, database-boundary, action, and UI tests.

---

## 2. AI Provider Abstraction

### Provider-Neutral Contract

Define a server-only interface. Feature and UI modules may depend on this
interface and its neutral types; they must not import Pollinations-specific types.

The contract should be equivalent to:

```ts
interface AIProvider {
  readonly providerId: string;

  generateMission(
    request: ProviderMissionRequest,
    options: { signal: AbortSignal },
  ): Promise<ProviderMissionResult>;
}
```

`ProviderMissionRequest` contains only:

- the versioned system prompt;
- the versioned user prompt;
- the requested response schema/version; and
- provider-neutral generation controls such as temperature and output-token
  limit.

`ProviderMissionResult` contains only:

- untrusted response content as `unknown` or a JSON string;
- the provider identifier;
- the model identifier returned by the provider when present;
- nullable input and output usage units; and
- a provider request/correlation identifier only when it is documented as safe
  and contains no secret.

The provider boundary does not validate ownership, write tasks, render UI, or
decide GitHub permissions. The mission service owns those responsibilities.

### Normalized Provider Errors

Provider implementations must map errors to a small internal union:

```text
configuration_error
authentication_error
quota_exhausted
rate_limited
request_rejected
content_rejected
invalid_response
timed_out
temporarily_unavailable
unknown_provider_error
```

Each error may carry only:

- its fixed code;
- whether a retry is safe;
- an optional HTTP status;
- an optional bounded retry delay; and
- safe provider/model identifiers.

Raw response bodies, prompts, credentials, stack traces, and arbitrary provider
error messages must not cross the adapter boundary or be persisted.

### Pollinations Implementation

The initial implementation uses Pollinations' current unified text API:

```text
POST https://gen.pollinations.ai/v1/chat/completions
Authorization: Bearer <server-only key>
Content-Type: application/json
```

The request must:

- use the configured model, defaulting to Pollinations' `openai` model alias;
- send system and user messages separately;
- set `stream: false`;
- set `response_format: { "type": "json_object" }`; a configured model that does
  not support this contract is rejected during configuration/manual verification;
- use a low temperature, initially `0.2`;
- cap output at 1,500 tokens;
- enable the provider's documented `sexual,violence` content-safety categories;
  do not enable `privacy,secrets,shield` for this prompt because those provider
  filters reject the prompt's own negative security instructions. Blumo's strict
  deterministic validation still rejects secrets, paths, destructive actions,
  prompt injection, and approval bypasses after generation; and
- never place the API key in a URL, query string, client bundle, log, prop,
  response, or database row.

Use native server `fetch` unless implementation review identifies a documented
requirement that cannot be met without an SDK. The adapter parses only the
documented `choices[0].message.content`, model, usage, and safe response metadata.
Missing choices, missing content, non-JSON content, and unexpected response shapes
are `invalid_response`.

Authoritative provider references reviewed for this specification:

- [Pollinations API documentation](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)
- [Pollinations repository and authentication guidance](https://github.com/pollinations/pollinations)
- [Pollinations generated API reference](https://gen.pollinations.ai/docs)

### Environment

Add during implementation:

```text
POLLINATIONS_API_KEY
POLLINATIONS_TEXT_MODEL
```

`POLLINATIONS_API_KEY` is a required non-empty server secret when mission
generation is invoked. `POLLINATIONS_TEXT_MODEL` is a server-only optional
configuration value whose default is `openai`. Neither variable may use a
`NEXT_PUBLIC_` prefix.

Environment validation must not make unrelated public pages fail to build merely
because the optional mission feature has not been configured. Generation must
fail closed with `configuration_error` at the server boundary. Production
verification nevertheless requires a real configured key.

The actual model identifier returned by Pollinations is stored in
`daily_tasks.ai_model` and `ai_usage_records.model`; it is never trusted as user
content.

### Future OpenAI and Claude Support

Future direct `OpenAIProvider` and `ClaudeProvider` adapters must implement the
same interface, normalized result, timeout, and error contracts. Adding one must
not require changes to the mission service, prompt input, database write shape,
or UI state model.

Unit 10 does not implement direct OpenAI or Anthropic/Claude adapters, a provider
selection UI, automatic provider failover, or a provider registry editable by a
user. A Pollinations model internally routed to an upstream model is still stored
and treated as provider `pollinations`.

### Timeouts

- Each provider attempt has a 15-second deadline enforced with
  `AbortController`.
- The complete provider operation, including retry delay and both attempts, has a
  25-second deadline.
- Client disconnect or Server Action cancellation must abort the active request
  when the runtime exposes a signal.
- Timeout errors are normalized to `timed_out`; late responses may not finalize a
  task after its generation claim is no longer current.

### Retry Strategy

One generation request may make at most two provider calls: the initial call and
one automatic retry.

Automatic retry is permitted only for:

- a network/transport failure before a usable response;
- HTTP `408`, `429`, `502`, `503`, or `504`; or
- an explicit provider response documented as transient.

Respect a valid `Retry-After` value when it is no more than two seconds. Otherwise
use bounded jitter between 250 and 750 milliseconds. If the remaining 25-second
operation budget cannot accommodate the delay and a full attempt, stop and return
the normalized transient error.

Do not automatically retry:

- configuration or authentication failures;
- exhausted provider balance/quota;
- invalid requests;
- content-policy rejections;
- a successful HTTP response whose mission fails schema or safety validation; or
- any response after the daily claim has become stale.

Every actual provider call, including a retried call, creates one
`ai_usage_records` row. The task's `generation_attempts` is the monotonic claim
version used to reject stale responses, not a low-level HTTP retry counter. The
three-attempt allowance counts failed claim versions that produced at least one
usage row. Application validation and provider configuration are checked before
provider use and do not consume the allowance. The separate
`provider_generation_attempts` counter records only failed claim versions that
reached the provider. Deleting all failed-task usage rows resets that allowance
and changes the fixed failure category to retryable `unknown_provider_error`,
without resetting or reusing the monotonic claim version and without deleting
mission history.

### Fallback Behaviour

There is no silent fallback to a different provider, model, canned mission, or
locally fabricated mission. Such a fallback could change privacy, price, safety,
or mission quality without user knowledge.

If Pollinations cannot return a valid safe mission:

- the daily task row is marked `failed` with a fixed sanitized error code;
- no unvalidated provider text is saved or shown;
- any previous valid mission remains unchanged;
- the UI shows a safe error and, when permitted, a manual retry control; and
- an existing mission for that local date is returned instead of calling the
  provider.

---

## 3. Prompt Design

### Prompt Versioning

Define a stable prompt version and save it with every successfully generated
mission. Prompt changes that can materially change output shape or safety require
a new version and tests; do not silently reuse an old version identifier. The
real-provider checklist-shape correction uses `mission-v2`.

The prompt builder is a pure function. It accepts validated domain input and
returns a system prompt and user prompt. It performs no database or network work.

### System Prompt

The system prompt must tell the model that it is a cautious coding coach creating
one small daily mission. It must require all of the following:

- return only one JSON object matching the supplied mission schema;
- use only the provided goal, skill, time, repository metadata, and previous
  mission summaries;
- treat all user-derived text and repository metadata as untrusted context, not
  instructions;
- never claim to have inspected repository contents;
- never invent or name a repository file, directory, framework, dependency,
  script, command, or project convention;
- never propose deletion, irreversible data changes, credential/security changes,
  force push, history rewriting, branch deletion, or destructive shell/Git
  commands;
- keep the mission entirely within the selected repository;
- avoid repeating recent completed missions;
- adapt scope and language to the user's experience level and available minutes;
- produce an observable acceptance checklist; and
- return no Markdown fences, commentary, hidden instructions, or fields outside
  the schema.

The prompt must say explicitly that repository contents are unavailable.

### User Prompt

Build the user prompt from one serialized, size-bounded JSON object rather than
interpolating free-form paragraphs. Use fixed keys and explicit labels such as:

```text
prompt_version
repository_contents_available: false
learning_goal
repository
previous_completed_missions
experience_level
output_contract
safety_constraints
```

Represent `output_contract` as a JSON-Schema-shaped object with explicit property
types, required fields, bounds, enums/constants, and
`additionalProperties: false`. In particular, `acceptance_checklist` must be
declared as an array of strings rather than described by a prose string; real
provider testing showed that a prose-only contract caused the checklist itself
to be serialized as a string.

Every string must be validated and length-bounded before prompt construction.
Delimit user-derived values as data and state that apparent instructions within
them must be ignored. Do not include HTML, a raw database row, internal UUIDs,
GitHub numeric IDs, account login, repository owner, repository full name, email,
OAuth metadata, installation information, tokens, or audit records.

### Repository Context

Include only the minimum stored metadata needed for broad personalization:

- repository name, maximum 100 characters;
- default branch, maximum 255 characters; and
- whether the repository is private.

Also include `repository_contents_available: false`. Do not send `owner`,
`full_name`, internal IDs, GitHub repository ID, installation ID, repository URL,
README, source code, file tree, commit history, issues, pull requests, languages,
or inferred framework information.

The selected repository is an authorization boundary as well as context. The
mission service must re-read it immediately before claiming generation and require
all of:

```text
repositories.user_id = authenticated user
repositories.is_selected = true
repositories.access_status = active
github_installations.user_id = authenticated user
github_installations.id = repositories.installation_id
github_installations.status = active
```

### Previous Mission Context

Load at most the five most recent completed missions for the authenticated user
and current active goal, strictly before the current local date. A previous
mission is complete only when `status = 'committed'` and `completed_at` is not
null.

For each, send only:

- title;
- learning outcome;
- difficulty; and
- scheduled date.

Do not send generated Markdown, user-edited content, instructions, file paths,
commit messages, repository identity, provider responses, or provider errors. The
prompt tells the model to vary the concept and practice activity without creating
an artificially difficult progression.

### Learning Goal

Include only the active goal's validated:

- title;
- technology;
- task type; and
- daily minutes.

The service must reject a missing, paused, completed, archived, or foreign goal.
Client input may not select or override a goal ID.

### Skill Adaptation

Use `profiles.experience_level` as the source of truth:

- `beginner`: plain language, one concept, guided and small acceptance steps, no
  assumed advanced tooling;
- `intermediate`: one focused application or comparison, moderate independence,
  and explicit trade-off awareness where relevant;
- `advanced`: a tightly scoped design, analysis, testing, or refinement exercise
  with concise guidance and no unnecessary tutorial prose.

The provider output `difficulty` must equal the stored experience level. The model
may reduce scope but may not increase difficulty beyond that level. Missing or
unknown experience values fail input validation rather than defaulting silently.

---

## 4. Mission Format

The provider must return exactly these fields:

| Field | Contract |
| --- | --- |
| `title` | Trimmed plain text, 5–100 characters |
| `description` | Trimmed plain text, 20–500 characters |
| `estimated_minutes` | One of `10`, `20`, `30`, `45`, `60`; no greater than the active goal's daily minutes |
| `difficulty` | Exactly `beginner`, `intermediate`, or `advanced`; must equal the stored experience level |
| `acceptance_checklist` | Array of 2–6 unique plain-text items, each 5–160 characters |
| `suggested_commit_message` | One line, 5–100 characters, imperative and free of control characters |
| `suggested_branch` | Must exactly equal the selected repository's stored default branch |
| `learning_outcome` | Trimmed plain text, 10–300 characters |

Define a strict Zod object with unknown keys rejected. Parse provider output as
untrusted data, normalize only surrounding whitespace, and then validate. Do not
coerce strings to numbers, arrays, or enum values. Do not truncate an invalid
provider response into validity.

After Zod parsing, run deterministic domain validation:

- title, description, checklist, commit message, and learning outcome contain no
  control characters or HTML tags;
- checklist items are unique after case-folding and whitespace normalization;
- `estimated_minutes` does not exceed the goal limit;
- `difficulty` equals the profile level;
- `suggested_branch` equals the selected repository default branch;
- all generated text passes the mission safety checks below; and
- the serialized validated mission stays within a 12 KiB application limit.

Persistence mapping:

```text
title                    -> daily_tasks.title
description              -> daily_tasks.summary
estimated_minutes        -> daily_tasks.estimated_minutes
difficulty               -> daily_tasks.difficulty
acceptance_checklist      -> daily_tasks.acceptance_checklist
suggested_commit_message -> daily_tasks.suggested_commit_message
suggested_branch          -> daily_tasks.suggested_branch
learning_outcome          -> daily_tasks.learning_outcome
```

`instructions`, `skill_tags`, `suggested_path`, `generated_markdown`,
`user_markdown`, and `user_commit_message` remain null in Unit 10. Later units may
populate them only under their own reviewed specifications. In particular, Unit
10 does not ask the model for a path or repository file content.

The server stores the exact validated field values. It may not replace an invalid
branch, difficulty, estimate, or unsafe text with a server-generated value and
then describe the output as provider-validated.

---

## 5. Database Behaviour

### Schema Changes

Create the next unused ordered migration; never edit an applied migration. Update
`context/database-schema.md` in the implementation change before applying it.

Add to `daily_tasks`:

| Column | Type | Rules |
| --- | --- | --- |
| `difficulty` | text | Nullable for old rows; new successful missions require `beginner`, `intermediate`, or `advanced` |
| `suggested_branch` | text | Nullable for old rows; new successful missions require non-empty text |
| `learning_outcome` | text | Nullable for old rows; new successful missions require non-empty text |
| `prompt_version` | text | Nullable for old rows; new successful missions require the current fixed version |
| `generation_error_code` | text | Nullable fixed internal code; no provider message |

Add a nullable internal `provider_call_id uuid` to `ai_usage_records` and a unique
partial index where it is not null. Generate a fresh call ID on the server before
each provider HTTP attempt. It is an idempotency key for recording that one call,
not a credential or provider-supplied identifier. Existing usage rows remain
unchanged.

Extend the `daily_tasks.status` check to include `generating`. Do this in the new
migration by replacing the named check constraint safely; do not change the old
migration. Add checks that `generation_attempts > 0`,
`provider_generation_attempts` is between zero and three, and successful Unit 10 fields
are present when status is `generated` or later. Existing legacy rows must remain
valid during migration, so any stronger cross-column constraint must be versioned
or limited to rows with non-null `prompt_version`.

Add a unique index on:

```text
daily_tasks(user_id, scheduled_date)
```

This is the database backstop for one daily mission. Implementation must preflight
existing data and stop for an explicit data-resolution migration if duplicates
already exist; it must not delete or silently merge historical rows.

### User-Local Day

Compute `scheduled_date` on the server from the current UTC time and the profile's
validated IANA timezone. Do not accept a date or timezone from form data. Tests
must freeze time and cover dates on both sides of UTC midnight and a daylight
saving transition.

The date is fixed when the task is first claimed. A later timezone change does not
rewrite historical scheduled dates.

### Atomic Generation Claim

Add a narrowly scoped service-role-only database function to claim generation.
It receives the independently authenticated user ID and current server time/date,
then verifies in the database that the profile, active goal, selected repository,
and active installation all belong to that user.

In one transaction, with the relevant daily row locked, it returns one of:

- `claimed`: insert one placeholder `daily_tasks` row with `status = generating`,
  the verified user/goal/repository IDs, date, a fixed non-user-visible placeholder
  title, and `generation_attempts = 1`;
- `retry_claimed`: for the same row only when `status = failed` and attempts are
  below the provider-backed limit, set `status = generating`, increment the
  monotonic claim version, clear the fixed error code, and return the new claim
  version;
- `in_progress`: the same row is already generating;
- `existing`: a valid mission or later workflow state already exists for the
  local date;
- `retry_exhausted`: the failed row has reached the manual attempt limit; or
- a fixed prerequisite/ownership error.

The unique index and row lock, not a read-then-insert check, resolve concurrent
requests. Only `claimed` and `retry_claimed` permit a provider call.

Failed claims that reached the provider are limited to three per task. The
separate `provider_generation_attempts` allowance is enforced in the database
claim function and mirrored in server UI logic. `generation_attempts` remains a
monotonic stale-response claim version. Automatic HTTP retry inside one provider
operation does not increment either claim-level counter.

The claim function must be `security definer`, set a fixed `search_path`, revoke
execution from `public`, `anon`, and `authenticated`, and be executable only by
`service_role`. It must return IDs and bounded prompt context only after every
ownership/access invariant succeeds. It never returns secrets.

### Save Generated Mission

Add a service-role-only finalization function. In one transaction it must:

1. lock the claimed task;
2. require the same `user_id`, `status = generating`, and
   `generation_attempts = claim version`;
3. re-verify that the task's goal, repository, and installation still belong to
   the user and remain active/selected;
4. write the validated mission fields, `ai_provider`, returned `ai_model`, and
   `prompt_version`;
5. clear `generation_error_code`;
6. change status to `generated`; and
7. insert the successful `ai_usage_records` row for the final provider call.

If repository selection/access, installation status, goal status, or ownership
changed while the provider was running, finalization fails closed and stores no
mission. A stale response cannot overwrite a newer claim or existing mission.

### Failed Attempts and Usage

Add a matching failure function that changes only the current generating claim to
`failed` and stores one allowlisted `generation_error_code`. It must not store
provider output or error text. A claim-version mismatch is a no-op.

Write one append-only `ai_usage_records` row for every actual provider HTTP call,
whether successful or failed:

```text
user_id = authenticated owner
task_id = claimed task
provider = pollinations
model = configured/returned safe model identifier when available
operation = task_generation
input_units = provider usage when available, otherwise null
output_units = provider usage when available, otherwise null
estimated_cost_minor = null until a reviewed cost model exists
success = true only for the provider call whose output passed provider-shape,
          Zod, domain, and safety validation
```

Because usage records are server-only writes, automatic retry usage must be
recorded even when a later call succeeds. Final mission persistence and the final
success usage row are atomic. Failed-call usage recording and task failure must
also use one transaction when the claim is current. Usage insertion uses
`provider_call_id` conflict handling so a retried database operation cannot create
a duplicate record. If a response arrives for a stale claim, record its usage
idempotently without changing the task.

### Audit Logging

Every generation lifecycle mutation writes a sanitized `audit_logs` row in the
same database transaction as the state change. Use fixed action names:

```text
mission_generation_started
mission_generation_retried
mission_generation_succeeded
mission_generation_failed
```

Set `user_id` to the independently authenticated owner, `resource_type = task`,
and `resource_id` to the daily task ID. Metadata is an allowlisted object containing
only `scheduled_date`, prompt version when known, provider identifier when known,
generation attempt number, and a fixed result/error code. Do not include mission
content, prompt content, repository names/IDs, profile or goal text, provider
responses/messages, usage counts, secrets, or stack traces.

Returning an existing or in-progress row without mutation creates no audit row.
Low-level automatic HTTP retry usage is recorded in `ai_usage_records`; it does
not create another lifecycle audit action unless the task state changes.

### Duplicate Prevention

- One unique row per `user_id + scheduled_date` prevents multiple daily missions.
- The atomic claim prevents simultaneous provider calls for ordinary duplicate
  submissions.
- An existing valid mission always wins; it is returned without provider work.
- A valid `generated`, `in_progress`, `ready`, `committing`, or `committed` mission
  cannot be regenerated or overwritten in Unit 10.
- Only a `failed` placeholder may be retried, and only in place.
- A retry never creates a second row and never changes its goal, repository, or
  scheduled date.

### Preserve History

Never delete a task to retry, change a selected repository, change a learning
goal, or enforce the daily uniqueness rule. Historical rows keep their original
goal, repository reference, date, prompt version, validated mission, provider,
model, and completion data.

If a repository later becomes removed/unavailable or an installation becomes
suspended/uninstalled, the mission remains readable. It cannot authorize new
GitHub work, and repository history must not be rewritten.

---

## 6. Safety

### Server-Side Rules

Prompt instructions are not a security boundary. After schema validation, scan
all generated text with a deterministic, tested mission-safety validator.

Reject the entire output if it:

- names or appears to name a file, directory, relative path, absolute path,
  filename extension, or repository-specific script because no such context was
  supplied;
- claims that a file, framework, package, language, command, convention, test
  runner, or directory exists in the repository;
- instructs deletion, truncation, destructive migration, data reset, credential
  rotation, permission change, repository setting change, or irreversible action;
- contains `force push`, `--force`, `git reset`, `git clean`, branch deletion,
  history rewriting, `rm`, `rmdir`, `drop database/table`, or an equivalent
  destructive command/instruction;
- suggests operating on another repository, account, organization, deployment,
  external service, or local machine outside the selected repository;
- asks for a secret, token, key, credential, environment value, or private user
  data;
- contains executable HTML, script tags, control characters, prompt-injection
  instructions, or shell commands; or
- asks Blumo or the user to bypass review, ownership, branch, path, or approval
  controls.

The validator must use normalized case and Unicode-safe text handling. A denylist
is a minimum backstop, not permission to accept otherwise ambiguous destructive
instructions. Any ambiguous result fails with `unsafe_response`; it is never
partially shown.

### Repository Boundary

- The mission is associated only with the repository verified in its claim.
- Client input cannot supply or replace `repository_id`, owner, branch, or
  installation ID.
- The prompt may use only the minimal metadata above.
- Unit 10 performs no GitHub API call and generates no installation token.
- No mission text can grant permission to access another repository.

### Rendering and Execution

- Render mission strings as escaped React text, never `dangerouslySetInnerHTML`.
- Do not execute, evaluate, or pass provider output to a shell.
- Do not interpret output as a URL, API endpoint, SQL fragment, Git command, file
  path, or authorization decision.
- Do not store the raw provider response after validation.
- Do not log prompts or mission content in production operational logs.

---

## 7. UI Behaviour

Unit 10 extends the authenticated dashboard mission card. It does not create the
later task editing/approval workspace.

### Ready/Empty State

For an onboarded user with an active goal, active verified installation, and one
selected active repository, but no task for today:

- show a short explanation based on the goal and time budget;
- show **Generate today's mission**;
- submit through a Server Action;
- do not expose goal, user, repository, provider, date, or model IDs in editable
  form fields.

Prerequisite empty states are actionable:

- no active goal: link to learning-goal settings/onboarding;
- no active installation: link to `/github/connect`;
- suspended or uninstalled installation: show its existing reconnect/manage
  state;
- no active selected repository: link to `/repositories`;
- removed/unavailable selected repository: show that repository access changed
  and require repository management before generation.

The browser must not offer generation when server data says a prerequisite is
missing.

### Loading State

Immediately after submission:

- disable the generate/retry button;
- set `aria-busy=true` on the mission region;
- show stable text such as **Creating your mission…**;
- preserve card dimensions to avoid layout shift; and
- prevent double submission in the client while relying on the database claim as
  the actual concurrency defense.

If the page is loaded while today's task is `generating`, show the same loading
state and no second action. The page may refresh once after the action completes;
Unit 10 does not add background jobs or live polling infrastructure.

### Success State

After successful finalization, show:

- title;
- description;
- estimated minutes;
- difficulty;
- acceptance checklist;
- suggested commit message;
- suggested/default branch;
- learning outcome; and
- selected repository name from current owned application data, not AI text.

Announce success through an accessible status message such as **Today's mission
is ready.** Refresh the server-rendered dashboard data. Returning to the page on
the same local day renders the saved mission with no AI call.

Unit 10 may link to the existing task route only if that route can render the same
read-only mission safely. It must not implement the Unit 12 editing, preview,
approval, or commit workflow.

### Error State

Map internal failures to short user-safe messages:

- provider configuration/authentication/quota: mission generation is currently
  unavailable; do not suggest repeated retry;
- timeout, rate limit, or transient outage: try again shortly;
- invalid or unsafe response: Blumo could not create a safe mission; retry is
  allowed if attempts remain;
- prerequisite/access change: explain the relevant goal or GitHub connection
  action without exposing record existence for another user;
- unknown/database failure: generic temporary error and fixed correlation data
  only in sanitized server logs.

Never render provider error text, response content, prompt content, stack traces,
environment names, internal IDs, or secrets.

### Retry State

Show **Try again** only when:

- today's row is `failed`;
- fewer than three generation claims have been made;
- current authenticated prerequisites still pass; and
- the error is safe to retry.

Retry updates the same task row and re-enters the loading state. When the limit is
reached, show a stable unavailable message with no retry button. Refreshing,
opening another tab, or modifying form data cannot reset the database-enforced
limit.

---

## Authenticated Action Contract

Create a Server Action equivalent to `generateMissionAction()`. It accepts no
domain identifiers from the client. A CSRF-resistant Next.js Server Action plus
the authenticated Supabase session is the only browser mutation boundary.

Required order:

1. Retrieve the authenticated Supabase user on the server.
2. Validate the action request shape; no unexpected form fields are accepted.
3. Compute the user-local date from the stored profile timezone.
4. Claim generation through the atomic database function, which repeats
   ownership and prerequisite checks.
5. Return an existing/in-progress/limit/prerequisite result without provider work
   when applicable.
6. Build the versioned prompt from only the claimed, bounded context.
7. Call the configured provider with the timeout/retry policy.
8. Parse with Zod and run all deterministic domain/safety validation.
9. Finalize only the still-current claim, or fail the claim with a fixed code.
10. Revalidate the dashboard route on success and return a typed UI result.

The action response is a discriminated, serializable union with fixed codes. It
may include the saved task's internal ID after success, but it must not include a
prompt, raw provider result, credentials, internal error, service-role data, or
usage details.

---

## 8. Modules

Use this boundary unless implementation review documents an equivalent separation
without changing behavior:

```text
src/lib/ai/ai-provider.ts
src/lib/ai/ai-provider.types.ts
src/lib/ai/ai-provider.errors.ts
src/lib/ai/pollinations/pollinations-provider.ts
src/lib/ai/pollinations/pollinations.schema.ts
src/lib/ai/pollinations/pollinations.config.ts
src/features/missions/mission-output.schema.ts
src/features/missions/mission-prompt.ts
src/features/missions/mission-safety.ts
src/features/missions/mission-generation.types.ts
src/features/missions/mission-generation.service.ts
src/features/missions/mission-generation.actions.ts
src/features/missions/mission-generation.repository.ts
src/features/missions/MissionGenerator.tsx
src/features/dashboard/MissionCard.tsx
```

### AI Modules

- `ai-provider.ts`: server-only provider interface, with no database/UI imports.
- `ai-provider.types.ts`: neutral request/result types and usage measurements.
- `ai-provider.errors.ts`: fixed normalized error union and retry classification.
- `pollinations-provider.ts`: server-only fetch, timeout, response extraction, and
  Pollinations error mapping.
- `pollinations.schema.ts`: narrow Zod schemas for the provider envelope, not the
  mission content.
- `pollinations.config.ts`: server-only URL, model, and credential validation.

### Mission Modules

- `mission-output.schema.ts`: strict provider mission schema and domain
  refinements; no database/network work.
- `mission-prompt.ts`: pure versioned prompt builder with bounded untrusted input.
- `mission-safety.ts`: deterministic text/path/destructive-action checks.
- `mission-generation.types.ts`: domain input, saved mission, and action result
  unions.
- `mission-generation.repository.ts`: atomic claim/finalize/fail and owned
  read-model calls; no provider calls.
- `mission-generation.service.ts`: orchestration only; authentication is supplied
  by the action, and provider/database implementations are injected for tests.
- `mission-generation.actions.ts`: authenticated Server Action, empty request
  validation, safe result mapping, and route revalidation.
- `MissionGenerator.tsx`: pending, error, retry, and accessible status behavior.
- `MissionCard.tsx`: server-rendered prerequisite/existing-mission state and
  read-only validated mission display.

No provider, prompt, credential, admin client, or raw error module may be imported
by a Client Component.

---

## 9. Tests

Use Vitest and Testing Library where UI behavior is involved. Automated tests use
fake providers and mocked/transactional database boundaries; they must not spend
provider credits, require GitHub, or require a hosted Supabase project.

### Provider Contract Tests

- Pollinations request uses the documented endpoint, bearer header, configured
  model, separate messages, non-streaming mode, safe mode, low temperature, and
  token cap.
- API key never appears in URL, body, returned error, snapshot, or log.
- Successful provider envelopes map content, model, and usage correctly.
- Missing/invalid envelopes produce `invalid_response`.
- HTTP status classes map to the normalized codes.
- `408`, `429`, `502`, `503`, `504`, and network failures retry at most once.
- `Retry-After` and jitter stay within the defined bounds.
- non-retryable errors and invalid mission content make no automatic retry.
- per-attempt and total timeouts abort and return `timed_out`.
- future provider fakes satisfy the same interface without mission-service change.

### Prompt Tests

- deterministic input produces a stable versioned prompt snapshot.
- system and user prompt contain every required safety constraint.
- repository contents are explicitly unavailable.
- only allowed repository metadata is present.
- internal IDs, owner/full name, tokens, account data, and raw previous mission
  content are absent.
- at most five completed missions are included in newest-first order.
- each experience level gets the required adaptation instructions.
- hostile goal/repository strings remain delimited untrusted data and cannot
  alter the output contract.
- every prompt field obeys its size bound.

### Mission Schema and Safety Tests

- one valid mission parses and maps exactly to persistence fields.
- unknown/missing fields, coercible types, invalid enum values, excess lengths,
  excess checklist entries, duplicates, HTML, and control characters fail.
- estimate above goal time, difficulty different from profile, and branch
  different from repository default fail.
- concrete filenames, directory paths, absolute/relative paths, and invented
  repository claims fail.
- destructive commands, force push, resets, branch deletion, credential requests,
  external-repository actions, and prompt injection fail.
- unsafe output is never partially persisted or returned.

### Mission Service Tests

- unauthenticated request returns a typed unauthorized result before database or
  provider work.
- missing/inactive/foreign goal is rejected.
- missing/foreign/unselected/removed/unavailable repository is rejected.
- suspended/uninstalled/foreign installation is rejected.
- repository/installation state is rechecked at finalization.
- existing mission returns without provider call.
- in-progress claim returns without second provider call.
- two concurrent claims produce one provider-eligible result and one
  in-progress/existing result.
- successful output saves every required field, provider/model/prompt version,
  and success usage.
- provider/schema/safety failure marks only the current claim failed.
- stale claim response cannot overwrite a newer claim.
- failed task retries in place, increments attempts, and preserves IDs/context.
- fourth claim is rejected without provider work.
- each low-level provider call creates exactly one usage record.
- raw provider output/error is not stored.
- each lifecycle mutation writes the correct sanitized audit action atomically.

### Date and Database Tests

- IANA timezone conversion produces the correct local date on each side of UTC
  midnight.
- a daylight saving boundary produces the correct calendar date.
- invalid stored timezone fails safely.
- unique user/date constraint rejects duplicate rows.
- unique provider-call key makes usage recording idempotent.
- different users may have missions for the same date.
- historical tasks remain after goal/repository lifecycle changes.
- migration preserves legacy nullable mission fields.
- claim/finalize/fail functions expose no execution privilege to `anon` or
  `authenticated` and set a fixed search path.

### Action and UI Tests

- Server Action rejects unexpected client fields and trusts no client ID/date.
- action result contains no provider response, prompt, usage detail, or secret.
- ready state shows Generate.
- pending state disables the action and exposes accessible loading status.
- missing goal, no installation, suspended/uninstalled installation, no selected
  repository, and removed/unavailable repository show the correct action.
- success renders all eight mission fields and current owned repository name.
- error text is fixed and safe.
- retry appears only for retryable failed rows below the limit.
- exhausted retry and active generation show no enabled second action.
- React rendering escapes mission content and does not use raw HTML.

### Secret and Boundary Tests

- Pollinations configuration is absent from client bundles and Client Component
  imports.
- tests spy on logs and responses to prove the API key, prompt, provider body,
  service-role key, repository owner/full name, and internal errors are absent.
- no GitHub installation-token generator or GitHub API client is called.
- generated text is never executed or used as a path, SQL, shell command, or
  authorization input.

---

## 10. Verification

Run all of the following after implementation:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

All commands must exit successfully with no ignored failure introduced by Unit
10.

Manual verification in a production-like environment must confirm:

1. Configure a protected `POLLINATIONS_API_KEY`; confirm it is absent from page
   source, browser network payloads, client bundles, logs, errors, and database
   rows.
2. Sign in as an onboarded user with an active goal and selected active repository.
3. Generate a mission and observe loading, then all required mission fields.
4. Confirm the saved row contains the verified user, goal, repository, local date,
   provider/model, prompt version, and exact validated mission values.
5. Confirm the provider received only allowed goal/profile/repository/history
   context and no private repository content or identifying IDs.
6. Refresh and submit from a second tab; confirm no second mission or provider call
   is created for the same local date.
7. Simulate a retryable provider outage; confirm a safe error, an in-place retry,
   and enforced three-claim limit.
8. Simulate invalid and unsafe provider output; confirm no output is displayed or
   persisted as a valid mission.
9. Remove repository access or suspend the installation during generation;
   confirm finalization fails and no mission can authorize repository work.
10. Confirm previous completed mission rows remain unchanged and inform only the
    bounded next prompt context.
11. Inspect `ai_usage_records`; confirm one sanitized row per provider HTTP call
    and no prompt/response/secret storage.
12. Inspect `audit_logs`; confirm fixed generation lifecycle actions contain only
    allowlisted metadata and are atomic with their task state changes.
13. Verify loading, no-goal, no-installation, suspended/uninstalled installation,
    no-selection, removed/unavailable repository, success, error, retry, and
    retry-exhausted states at mobile and desktop widths with keyboard navigation
    and screen-reader status announcements.
14. Confirm Unit 10 performs no GitHub API request, installation-token generation,
    repository content read, file/branch/commit operation, email, or scheduled job.

Before marking Unit 10 complete:

- update `context/database-schema.md` and any environment/setup documentation to
  match the implemented contract;
- update `context/progress-tracker.md` with exact automated and manual verification
  results;
- record unresolved failures rather than weakening tests or safety checks; and
- do not begin Unit 11.

Unit 10 is complete only when every automated command and every applicable manual
verification item passes. A drafted or merged specification is not implementation
completion.

---

## 11. Explicit Exclusions

- Unit 11 implementation or any functionality not explicitly defined above.
- Repository file, README, source-code, tree, language, commit-history, issue, or
  pull-request reads.
- Repository-aware retrieval, embeddings, vector search, or prompt ingestion of
  repository content.
- GitHub installation-token generation for mission generation.
- Branch creation, branch switching, branch deletion, or branch protection
  changes.
- File creation, editing, deletion, upload, or GitHub content API calls.
- Git commits, force pushes, pull requests, reviews, merges, or releases.
- Generated Markdown/file content, path selection, task workspace editing,
  preview, approval, or commit controls.
- Executing generated code, tests, scripts, shell commands, or Git commands.
- AI-selected permissions, repositories, users, goals, providers, models, URLs,
  or API endpoints.
- Direct OpenAI or Anthropic/Claude adapters.
- Automatic cross-provider/model fallback or user-facing provider selection.
- Scheduled or background mission generation, cron, queues, notifications,
  Resend/email, weekly summaries, streak calculations, payments, or billing.
- GitHub webhook changes or new webhook event handling.
- Organization installation support.
- More than one valid mission per user-local day or regeneration of a valid
  mission.
- Unit 12 task workspace or any later build-unit functionality.
