# Unit 03: Core Database Schema and RLS

## Goal

Create the initial Supabase PostgreSQL schema for Blumo. At completion, all
core tables exist, every user-owned table has Row Level Security enabled with
correct policies, key business rules are enforced by database constraints, a
trigger automatically creates a profile row when a new auth user signs in, and
two independent test users cannot read or modify each other's data.

No onboarding UI, GitHub App, AI, email, or scheduling code is added in this
unit.

---

## Dependencies

- Unit 02 complete: Supabase project exists, credentials in `.env.local`.
- Supabase CLI installed locally (`supabase --version`).
- The Supabase project is linked (`supabase link --project-ref qznladkcqldqktqyrrzi`).

---

## Scope

### Included

- `supabase/migrations/` directory and all migration files listed below.
- `supabase/seed.sql` — local-only development seed (two test users and one
  goal each, used for RLS tests).
- `supabase/config.toml` — project configuration for local development.
- Generated TypeScript types: `src/types/database.ts`.
- A thin database type-helper module: `src/lib/supabase/types.ts`.
- Profile-creation trigger (PL/pgSQL function + trigger on `auth.users`).
- `updated_at` auto-update trigger function reused by all applicable tables.
- RLS policies on every user-owned table.
- Unit tests in `src/lib/supabase/rls.test.ts` proving cross-user isolation.

### Explicitly Excluded

- Onboarding form or any UI that writes to these tables.
- GitHub App integration tables (`github_installations`, `repositories`) — these
  tables are *created* in this unit but written to only by the server in later
  units via the admin client.
- AI usage records and audit logs are *created* in this unit for completeness but
  have no application writes yet.
- `schedules` and `email_preferences` tables are deferred to the units that need
  them (Phase 2 and Unit 17).
- Supabase Edge Functions.
- Any changes to `src/lib/env/server.ts` or `src/lib/env/public.ts`.

---

## Migration File Layout

Create migrations in `supabase/migrations/`. Use the timestamp prefix format
`YYYYMMDDHHMMSS_description.sql`. All migrations must be idempotent when
rerun against a fresh database.

### Migration 1 — `20240001000000_extensions.sql`

Enable required PostgreSQL extensions:

```sql
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
```

`uuid-ossp` provides `uuid_generate_v4()` as a fallback; Supabase also
exposes `gen_random_uuid()` from `pgcrypto` which is preferred for new
primary keys.

### Migration 2 — `20240001000001_updated_at_trigger.sql`

Create a reusable function that sets `updated_at = now()` before any UPDATE:

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

This function is referenced by trigger definitions in later migrations. Do not
create the triggers here — create them alongside their table.

### Migration 3 — `20240001000002_profiles.sql`

Create the `profiles` table, its constraints, RLS, indexes, and the
auth-user trigger:

```sql
create table public.profiles (
  id                     uuid        primary key references auth.users(id) on delete cascade,
  github_user_id         bigint      unique,
  github_username        text,
  display_name           text,
  avatar_url             text,
  timezone               text        not null default 'UTC',
  experience_level       text        not null default 'beginner'
                                     check (experience_level in ('beginner', 'intermediate', 'advanced')),
  onboarding_completed_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
```

**Constraints:**

- `id` references `auth.users(id)` with `ON DELETE CASCADE` so that deleting
  the Auth user removes the profile automatically.
- `github_user_id` unique nulls-not-distinct (two nulls are permitted; a
  non-null value must be globally unique).
- `experience_level` CHECK against the allowed set.
- `timezone` defaults to `'UTC'` — the application sets the real value only
  when the user selects or explicitly consents to detection.

**Indexes:**

```sql
create index profiles_github_user_id_idx on public.profiles (github_user_id)
  where github_user_id is not null;
```

**`updated_at` trigger:**

```sql
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
```

**RLS:**

```sql
alter table public.profiles enable row level security;

-- A user may read only their own profile.
create policy "profiles: owner read"
  on public.profiles for select
  using (id = auth.uid());

-- A user may update only their own profile.
create policy "profiles: owner update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Insert is handled by the trigger only; users cannot insert directly.
-- The service role bypasses RLS for the trigger function.
```

**Profile creation trigger:**

After a new row is inserted into `auth.users`, automatically create a matching
`profiles` row populated from the GitHub OAuth metadata:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    github_user_id,
    github_username,
    display_name,
    avatar_url
  )
  values (
    new.id,
    (new.raw_user_meta_data->>'provider_id')::bigint,
    new.raw_user_meta_data->>'user_name',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Important notes:

- The function uses `security definer` so it runs with the permissions of the
  owning role (postgres/service role), bypassing RLS for the insert.
- `on conflict (id) do nothing` makes the trigger safe to replay.
- `provider_id` is how Supabase stores the GitHub numeric user ID in the
  metadata for OAuth sign-ins.
- `set search_path = public` prevents search-path injection attacks.

### Migration 4 — `20240001000003_goals.sql`

```sql
create table public.goals (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  title          text        not null,
  technology     text        not null,
  task_type      text        not null,
  daily_minutes  integer     not null check (daily_minutes in (10, 20, 30, 45, 60)),
  status         text        not null default 'active'
                             check (status in ('active', 'paused', 'completed', 'archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- At most one active goal per user.
create unique index goals_one_active_per_user_idx
  on public.goals (user_id)
  where (status = 'active');

create index goals_user_status_idx on public.goals (user_id, status);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;

create policy "goals: owner read"
  on public.goals for select
  using (user_id = auth.uid());

create policy "goals: owner insert"
  on public.goals for insert
  with check (user_id = auth.uid());

create policy "goals: owner update"
  on public.goals for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "goals: owner delete"
  on public.goals for delete
  using (user_id = auth.uid());
```

**Delete behaviour:** `ON DELETE CASCADE` from `profiles` means deleting the
profile removes all goals. The application marks goals `archived` instead of
deleting; hard delete is only invoked during full account deletion.

### Migration 5 — `20240001000004_github_installations.sql`

```sql
create table public.github_installations (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  installation_id  bigint      not null unique,
  account_id       bigint      not null,
  account_login    text        not null,
  account_type     text        not null check (account_type in ('User', 'Organization')),
  status           text        not null default 'active'
                               check (status in ('active', 'suspended', 'uninstalled')),
  installed_at     timestamptz,
  suspended_at     timestamptz,
  uninstalled_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index github_installations_user_status_idx
  on public.github_installations (user_id, status);

create trigger github_installations_set_updated_at
  before update on public.github_installations
  for each row execute function public.set_updated_at();

alter table public.github_installations enable row level security;

-- Users may read their own installation records.
create policy "github_installations: owner read"
  on public.github_installations for select
  using (user_id = auth.uid());

-- Writes are server-only (service-role client, bypasses RLS).
-- No user-facing insert/update/delete policies.
```

**Write access note:** The application writes to `github_installations` only
through the admin (service-role) client inside server-only route handlers after
verifying the authenticated user. No user-facing RLS policies for writes are
needed; the service role bypasses RLS for these operations.

### Migration 6 — `20240001000005_repositories.sql`

```sql
create table public.repositories (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references public.profiles(id) on delete cascade,
  installation_id       uuid        not null references public.github_installations(id) on delete cascade,
  github_repository_id  bigint      not null,
  owner                 text        not null,
  name                  text        not null,
  full_name             text        not null,
  default_branch        text        not null default 'main',
  is_private            boolean     not null default false,
  is_selected           boolean     not null default false,
  access_status         text        not null default 'active'
                                    check (access_status in ('active', 'removed', 'unavailable')),
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- A repository appears at most once per user.
create unique index repositories_user_repo_unique_idx
  on public.repositories (user_id, github_repository_id);

-- At most one selected active repository per user.
create unique index repositories_one_selected_per_user_idx
  on public.repositories (user_id)
  where (is_selected = true and access_status = 'active');

create index repositories_user_selected_idx
  on public.repositories (user_id, is_selected, access_status);

create trigger repositories_set_updated_at
  before update on public.repositories
  for each row execute function public.set_updated_at();

alter table public.repositories enable row level security;

create policy "repositories: owner read"
  on public.repositories for select
  using (user_id = auth.uid());

-- Writes are server-only via the admin client.
```

### Migration 7 — `20240001000006_daily_tasks.sql`

```sql
create table public.daily_tasks (
  id                       uuid        primary key default gen_random_uuid(),
  user_id                  uuid        not null references public.profiles(id) on delete cascade,
  goal_id                  uuid        not null references public.goals(id) on delete cascade,
  repository_id            uuid        references public.repositories(id) on delete set null,
  scheduled_date           date        not null,
  title                    text        not null,
  summary                  text,
  instructions             jsonb,
  acceptance_checklist     jsonb,
  skill_tags               jsonb,
  estimated_minutes        integer,
  suggested_path           text,
  generated_markdown       text,
  user_markdown            text,
  suggested_commit_message text,
  user_commit_message      text,
  status                   text        not null default 'generated'
                                       check (status in (
                                         'generated', 'in_progress', 'ready',
                                         'committing', 'committed', 'failed', 'archived'
                                       )),
  ai_provider              text,
  ai_model                 text,
  generation_attempts      integer     not null default 1,
  approved_at              timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index daily_tasks_user_created_idx
  on public.daily_tasks (user_id, created_at desc);

create index daily_tasks_user_status_idx
  on public.daily_tasks (user_id, status);

create index daily_tasks_user_date_idx
  on public.daily_tasks (user_id, scheduled_date);

create trigger daily_tasks_set_updated_at
  before update on public.daily_tasks
  for each row execute function public.set_updated_at();

alter table public.daily_tasks enable row level security;

create policy "daily_tasks: owner read"
  on public.daily_tasks for select
  using (user_id = auth.uid());

create policy "daily_tasks: owner insert"
  on public.daily_tasks for insert
  with check (user_id = auth.uid());

create policy "daily_tasks: owner update"
  on public.daily_tasks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

**`repository_id` delete behaviour:** `ON DELETE SET NULL` preserves the task
history when repository access is revoked; the task record survives but the
repository link is cleared.

**`goal_id` delete behaviour:** `ON DELETE CASCADE` — when a goal is deleted
the associated tasks are also deleted. The application archives goals rather
than deleting them, so this cascade is a safety net only.

### Migration 8 — `20240001000007_commits.sql`

```sql
create table public.commits (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references public.profiles(id) on delete cascade,
  task_id            uuid        not null unique references public.daily_tasks(id) on delete restrict,
  repository_id      uuid        references public.repositories(id) on delete set null,
  github_commit_sha  text        not null unique,
  github_commit_url  text        not null,
  branch             text        not null,
  file_path          text        not null,
  commit_message     text        not null,
  content_snapshot   text        not null,
  status             text        not null default 'created'
                                 check (status in ('created', 'reconciled', 'failed')),
  created_at         timestamptz not null default now()
);

create index commits_user_created_idx
  on public.commits (user_id, created_at desc);

alter table public.commits enable row level security;

create policy "commits: owner read"
  on public.commits for select
  using (user_id = auth.uid());

-- Writes are server-only via the admin client after a verified GitHub response.
```

**One commit per task:** The `UNIQUE` constraint on `task_id` enforces the
invariant at the database level. A task cannot produce more than one successful
commit record.

**`task_id` delete behaviour:** `ON DELETE RESTRICT` — a task that has a commit
record cannot be deleted. This preserves the audit trail.

**`repository_id` delete behaviour:** `ON DELETE SET NULL` — commit history
is preserved even when repository access is removed.

### Migration 9 — `20240001000008_ai_usage_records.sql`

```sql
create table public.ai_usage_records (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references public.profiles(id) on delete cascade,
  task_id               uuid        references public.daily_tasks(id) on delete set null,
  provider              text        not null,
  model                 text,
  operation             text        not null
                                    check (operation in (
                                      'task_generation', 'review', 'weekly_summary'
                                    )),
  input_units           integer,
  output_units          integer,
  estimated_cost_minor  integer,
  success               boolean     not null,
  created_at            timestamptz not null default now()
);

create index ai_usage_records_user_created_idx
  on public.ai_usage_records (user_id, created_at desc);

alter table public.ai_usage_records enable row level security;

create policy "ai_usage_records: owner read"
  on public.ai_usage_records for select
  using (user_id = auth.uid());

-- Writes are server-only via the admin client.
```

### Migration 10 — `20240001000009_audit_logs.sql`

```sql
create table public.audit_logs (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        references public.profiles(id) on delete set null,
  action         text        not null,
  resource_type  text        not null,
  resource_id    uuid,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);

create index audit_logs_user_created_idx
  on public.audit_logs (user_id, created_at desc);

alter table public.audit_logs enable row level security;

-- Users may read their own audit events; system events (user_id is null)
-- are not readable by any authenticated user through the client.
create policy "audit_logs: owner read"
  on public.audit_logs for select
  using (user_id = auth.uid());

-- All writes are server-only via the admin client.
```

---

## TypeScript Type Generation

After applying migrations, generate TypeScript types from the live Supabase
schema and write them to `src/types/database.ts`.

### Command

```bash
supabase gen types typescript \
  --project-id qznladkcqldqktqyrrzi \
  > src/types/database.ts
```

Or, using the linked project:

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

Add a `db:types` npm script to `package.json`:

```json
"db:types": "supabase gen types typescript --linked > src/types/database.ts"
```

**Rules:**

- Do not hand-edit `src/types/database.ts`. It is generated output.
- Do not commit `src/types/database.ts` to the repository if the generated
  output contains values that change on every run. Add a comment at the top:

  ```ts
  // Generated by Supabase. Run `npm run db:types` to regenerate.
  // Do not hand-edit this file.
  ```

- Add `src/types/database.ts` to `.gitignore` only if the Supabase project
  environment is not stable. For a shared project, commit the generated types.

### Type Helper Module

Create `src/lib/supabase/types.ts`:

```ts
import type { Database } from "@/types/database";

// Convenience type aliases derived from generated types.
// Add more as tables are used in application code.

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type Goal = Database["public"]["Tables"]["goals"]["Row"];
export type GoalInsert = Database["public"]["Tables"]["goals"]["Insert"];
export type GoalUpdate = Database["public"]["Tables"]["goals"]["Update"];

export type DailyTask = Database["public"]["Tables"]["daily_tasks"]["Row"];
export type DailyTaskInsert = Database["public"]["Tables"]["daily_tasks"]["Insert"];
export type DailyTaskUpdate = Database["public"]["Tables"]["daily_tasks"]["Update"];

export type Commit = Database["public"]["Tables"]["commits"]["Row"];

export type GitHubInstallation =
  Database["public"]["Tables"]["github_installations"]["Row"];

export type Repository = Database["public"]["Tables"]["repositories"]["Row"];
```

This file *is* hand-maintained and may be committed. It depends on the
generated `database.ts` file.

---

## Profile Creation After Sign-In

The trigger `on_auth_user_created` (defined in Migration 3) fires automatically
when Supabase Auth creates a new user. No application code is needed to create
the profile row.

### Verification

After signing in through the OAuth flow (Unit 02), open the Supabase dashboard
or run:

```sql
select id, github_username, display_name
from public.profiles
where id = auth.uid();
```

A row should exist with the GitHub username and display name populated from
`raw_user_meta_data`.

### Application Helper

Create `src/features/auth/get-profile.ts`:

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

/**
 * Fetches the authenticated user's profile row.
 * Returns null if the user is not signed in or no profile row exists.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .single();

  if (error || !data) return null;
  return data;
}
```

---

## Updated_at Handling

The `set_updated_at()` trigger function is applied to:

| Table | Trigger name |
|---|---|
| `profiles` | `profiles_set_updated_at` |
| `goals` | `goals_set_updated_at` |
| `github_installations` | `github_installations_set_updated_at` |
| `repositories` | `repositories_set_updated_at` |
| `daily_tasks` | `daily_tasks_set_updated_at` |

`commits` has no `updated_at` column — commit records are immutable after
creation.

`ai_usage_records` and `audit_logs` are append-only and also have no
`updated_at`.

---

## Row Level Security Summary

| Table | RLS | User SELECT | User INSERT | User UPDATE | User DELETE | Service-role writes |
|---|---|---|---|---|---|---|
| `profiles` | ✓ | `id = auth.uid()` | trigger only | `id = auth.uid()` | — | profile creation trigger |
| `goals` | ✓ | `user_id = auth.uid()` | ✓ | `user_id = auth.uid()` | ✓ | — |
| `github_installations` | ✓ | `user_id = auth.uid()` | — | — | — | webhook handler, setup callback |
| `repositories` | ✓ | `user_id = auth.uid()` | — | — | — | repo sync, webhook handler |
| `daily_tasks` | ✓ | `user_id = auth.uid()` | ✓ | `user_id = auth.uid()` | — | AI generation route |
| `commits` | ✓ | `user_id = auth.uid()` | — | — | — | commit route |
| `ai_usage_records` | ✓ | `user_id = auth.uid()` | — | — | — | AI generation route |
| `audit_logs` | ✓ | `user_id = auth.uid()` | — | — | — | any server mutation |

**Rationale for service-role writes on certain tables:**
`github_installations`, `repositories`, `commits`, `ai_usage_records`, and
`audit_logs` are written by trusted server code that has already independently
authenticated the request or verified a webhook signature. Granting client-side
insert policies on those tables would allow a user to fabricate installation or
commit records.

---

## Partial Unique Constraints Reference

### One Active Goal Per User

```sql
create unique index goals_one_active_per_user_idx
  on public.goals (user_id)
  where (status = 'active');
```

Attempting to insert or update a second goal to `status = 'active'` for the
same `user_id` raises a PostgreSQL unique-violation error. Application code
must set the previous active goal to `paused` or `archived` before activating
a new one.

### One Selected Active Repository Per User

```sql
create unique index repositories_one_selected_per_user_idx
  on public.repositories (user_id)
  where (is_selected = true and access_status = 'active');
```

Attempting to mark a second repository as selected-and-active for the same
`user_id` raises a unique-violation. The server must clear the previous
selection before setting the new one.

### One Successful Commit Per Task

```sql
-- Full unique constraint on the commits table:
task_id uuid not null unique ...
```

A full `UNIQUE` constraint (not partial) because every task may have at most
one commit record of any status. If a task fails to commit, the failed record
must be investigated before retrying — the application must not insert a
second commit row for the same task.

---

## Tests

### Location

`src/lib/supabase/rls.test.ts`

### Strategy

These tests use the Supabase test utilities or mock the Supabase client to
verify that:

1. A user querying their own profile receives their row.
2. A user querying a different user's profile receives no rows.
3. A user querying their own goals receives their rows.
4. A user querying another user's goals receives no rows.
5. A user attempting to insert a goal with a different `user_id` is rejected.
6. A user querying their own tasks receives their rows.
7. A user querying another user's tasks receives no rows.

Because these tests require real Supabase RLS evaluation, they are written as
integration tests that run against the local Supabase instance
(`supabase start` required) or are mocked using the Supabase test helper
pattern.

**Minimum coverage for unit completion:** At least 4 passing tests that assert
cross-user data isolation using mocked Supabase responses that simulate RLS
policy behaviour.

### Example Mock Pattern

```ts
// Simulate RLS by mocking the Supabase client to return data only when
// the queried user_id matches the caller's uid.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
```

Tests must not require real Supabase credentials. Mock the client responses
to reflect what RLS would produce (empty arrays for cross-user queries,
correct rows for self-queries).

---

## Supabase Config

Create `supabase/config.toml` to support local development:

```toml
project_id = "qznladkcqldqktqyrrzi"

[api]
enabled = true
port = 54321
schemas = ["public", "storage", "graphql_public"]

[db]
port = 54322
shadow_port = 54320
major_version = 15

[studio]
enabled = true
port = 54323

[inbucket]
enabled = true
port = 54324

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["https://localhost:3000"]
jwt_expiry = 3600
enable_signup = true

[auth.external.github]
enabled = true
client_id = "env(GITHUB_APP_CLIENT_ID)"
secret = "env(GITHUB_APP_CLIENT_SECRET)"
```

---

## Seed Data

Create `supabase/seed.sql` for local development only. This file is not applied
in production.

```sql
-- Local development seed: two test users for RLS verification.
-- These users are created in the auth.users table by the Supabase CLI
-- during `supabase db reset`. Profile rows are created by the trigger.

-- Note: Supabase CLI handles the auth.users insertion; add test profiles
-- manually only if the trigger does not fire during seeding:

insert into public.profiles (id, github_username, display_name, timezone, experience_level)
values
  ('00000000-0000-0000-0000-000000000001', 'test-user-alpha', 'Test User Alpha', 'UTC', 'beginner'),
  ('00000000-0000-0000-0000-000000000002', 'test-user-beta',  'Test User Beta',  'UTC', 'beginner')
on conflict (id) do nothing;

-- One active goal per test user
insert into public.goals (id, user_id, title, technology, task_type, daily_minutes, status)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Learn React fundamentals',
    'React',
    'learning_note',
    30,
    'active'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Practice TypeScript',
    'TypeScript',
    'coding_challenge',
    20,
    'active'
  )
on conflict (id) do nothing;
```

---

## Applying Migrations

### Against the Linked Remote Project

```bash
supabase db push
```

This applies all unapplied migrations in `supabase/migrations/` to the linked
remote Supabase project.

### Generating Types After Push

```bash
npm run db:types
```

### Local Development (Optional)

```bash
supabase start      # Start local Supabase stack
supabase db reset   # Apply all migrations + seed.sql
npm run db:types    # Regenerate types from local schema
```

---

## Verification Checklist

- [ ] `supabase/migrations/` directory exists with all 10 migration files.
- [ ] `supabase/config.toml` exists.
- [ ] `supabase/seed.sql` exists.
- [ ] `supabase db push` applies all migrations without errors against the
  linked project.
- [ ] `npm run db:types` generates `src/types/database.ts` without errors.
- [ ] `src/types/database.ts` contains types for `profiles`, `goals`,
  `github_installations`, `repositories`, `daily_tasks`, and `commits`.
- [ ] `src/lib/supabase/types.ts` compiles without errors.
- [ ] After signing in via OAuth, a `profiles` row exists for the authenticated
  user in the Supabase dashboard.
- [ ] The profile row contains `github_username` and `display_name` from
  GitHub OAuth metadata.
- [ ] Attempting to query another user's profile via the anon client returns
  zero rows (verify in the Supabase SQL editor or test).
- [ ] The partial unique index prevents a second active goal from being inserted
  for the same user (verify with a direct SQL test in the Supabase dashboard).
- [ ] The partial unique index prevents a second selected active repository
  from being inserted for the same user.
- [ ] The unique constraint on `commits.task_id` prevents two commit rows for
  the same task.
- [ ] `src/features/auth/get-profile.ts` compiles and the return type matches
  `Profile` from `src/lib/supabase/types.ts`.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes (at least 14 total tests including 4+ new RLS tests).
- [ ] `npm run build` passes.
- [ ] `context/progress-tracker.md` records Unit 03 completion.

---

## What Is Not Changed

- `src/lib/env/server.ts` and `src/lib/env/public.ts` — unchanged.
- Any UI component, page, or layout — unchanged.
- The proxy (`src/proxy.ts`) and auth callback — unchanged.
- `src/features/auth/` except the addition of `get-profile.ts`.
- No Supabase Edge Functions are created.
- No changes to `supabase/functions/`.
