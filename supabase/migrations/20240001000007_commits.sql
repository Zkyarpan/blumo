-- Migration 8: commits table.
-- Records approved GitHub commits. Written by server-only code after a
-- verified GitHub API response. The UNIQUE constraint on task_id enforces
-- the invariant: at most one commit record per task, regardless of status.

create table public.commits (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.profiles(id) on delete cascade,
  -- ON DELETE RESTRICT: a task with a commit cannot be deleted (preserves audit trail).
  task_id           uuid        not null unique references public.daily_tasks(id) on delete restrict,
  -- ON DELETE SET NULL: commit history is preserved when repository access is removed.
  repository_id     uuid        references public.repositories(id) on delete set null,
  github_commit_sha text        not null unique,
  github_commit_url text        not null,
  branch            text        not null,
  file_path         text        not null,
  commit_message    text        not null,
  content_snapshot  text        not null,
  status            text        not null default 'created'
                                check (status in ('created', 'reconciled', 'failed')),
  created_at        timestamptz not null default now()
  -- No updated_at: commit records are immutable after creation.
);

create index commits_user_created_idx
  on public.commits (user_id, created_at desc);

alter table public.commits enable row level security;

-- Users may read their own commit records.
-- All writes happen via the service-role admin client after a verified GitHub response.
create policy "commits: owner read"
  on public.commits for select
  using (user_id = auth.uid());
